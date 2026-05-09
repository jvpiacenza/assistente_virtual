# =============================================================================
#  embed_service.py
#  Microserviço Python para RAG semântico com embeddings.
#
#  Responsabilidades:
#    1. Gerar embeddings da base de conhecimento usando sentence-transformers
#    2. Salvar embeddings em embeddings.npy (não recalcula se já existir)
#    3. Expor endpoints HTTP para o Node.js:
#         POST /search  → recebe texto, retorna chunks mais relevantes
#         POST /embed   → recebe texto, retorna embedding bruto
#         GET  /health  → status do serviço
#
#  Porta padrão: 5001 (Node.js roda em 5000)
# =============================================================================

import os
import json
import numpy as np
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
from knowledge_base import CHUNKS

# ─────────────────────────────────────────────
#  CONFIGURAÇÕES
# ─────────────────────────────────────────────

# Modelo multilíngue otimizado para PT-BR e similaridade semântica.
# paraphrase-multilingual-MiniLM-L12-v2 entende português nativamente,
# ao contrário do all-MiniLM-L6-v2 que é só inglês.
MODEL_NAME       = "paraphrase-multilingual-MiniLM-L12-v2"

# Arquivos persistidos em disco
EMBEDDINGS_FILE  = "embeddings.npy"   # vetores (shape: n_chunks × 384)
CHUNKS_FILE      = "chunks.json"      # textos dos chunks (para retornar ao Node)

# Similaridade mínima para um chunk ser considerado relevante
SIMILARITY_THRESHOLD = 0.30

# Porta do microserviço Python
PORT = 5001

# ─────────────────────────────────────────────
#  CARREGAMENTO DO MODELO E DOS EMBEDDINGS
# ─────────────────────────────────────────────

print("=" * 55)
print("  GelaTech — Serviço de Embeddings")
print(f"  Modelo: {MODEL_NAME}")
print("=" * 55)

print("\n[1/3] Carregando modelo sentence-transformers...")
model = SentenceTransformer(MODEL_NAME)
print(f"      Modelo carregado. Dimensão dos embeddings: {model.get_sentence_embedding_dimension()}")

def load_or_build_embeddings():
    """
    Carrega embeddings do disco se já existirem.
    Caso contrário, gera e salva.

    Retorna:
        embeddings (np.ndarray): matriz shape (n_chunks, dim)
        chunks (list[str]): textos correspondentes
    """
    # Se ambos os arquivos existem, carrega do disco (não recalcula)
    if os.path.exists(EMBEDDINGS_FILE) and os.path.exists(CHUNKS_FILE):
        print("\n[2/3] Encontrado embeddings.npy — carregando do disco...")
        embeddings = np.load(EMBEDDINGS_FILE)
        with open(CHUNKS_FILE, "r", encoding="utf-8") as f:
            chunks = json.load(f)

        # Verifica se a base de conhecimento mudou desde o último build
        if len(chunks) != len(CHUNKS):
            print("      Base de conhecimento alterada — reconstruindo embeddings...")
            return build_and_save_embeddings()

        print(f"      {len(chunks)} chunks carregados. Shape: {embeddings.shape}")
        return embeddings, chunks

    # Primeira execução: gera os embeddings
    return build_and_save_embeddings()


def build_and_save_embeddings():
    """
    Gera embeddings de todos os chunks e salva em disco.

    O arquivo embeddings.npy contém uma matriz numpy onde:
      - Cada linha i corresponde ao embedding do CHUNKS[i]
      - Shape: (n_chunks, 384) para o modelo escolhido
      - Dtype: float32

    Por que .npy? É o formato nativo do NumPy — leitura/escrita rápida,
    sem overhead de serialização, e requisito acadêmico do projeto.
    """
    print("\n[2/3] Gerando embeddings da base de conhecimento...")
    print(f"      {len(CHUNKS)} chunks para embeddar...")

    # model.encode() retorna np.ndarray shape (n, dim) automaticamente
    embeddings = model.encode(
        CHUNKS,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True   # normalizar = cosine similarity vira produto escalar (mais rápido)
    )

    # Salva a matriz de embeddings
    np.save(EMBEDDINGS_FILE, embeddings)
    print(f"\n      Salvo em '{EMBEDDINGS_FILE}'  shape={embeddings.shape}  dtype={embeddings.dtype}")

    # Salva os textos dos chunks para retornar ao Node.js durante a busca
    with open(CHUNKS_FILE, "w", encoding="utf-8") as f:
        json.dump(CHUNKS, f, ensure_ascii=False, indent=2)
    print(f"      Salvo em '{CHUNKS_FILE}'  ({len(CHUNKS)} chunks)")

    return embeddings, CHUNKS


# Carrega (ou gera) ao iniciar o processo — feito uma única vez
KB_EMBEDDINGS, KB_CHUNKS = load_or_build_embeddings()
print(f"\n[3/3] Serviço pronto na porta {PORT}")
print("=" * 55 + "\n")

# ─────────────────────────────────────────────
#  BUSCA SEMÂNTICA — COSINE SIMILARITY
# ─────────────────────────────────────────────

def cosine_similarity_batch(query_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """
    Calcula similaridade de cosseno entre um vetor de consulta e todos
    os vetores da matriz de embeddings da base de conhecimento.

    Como os embeddings são normalizados (normalize_embeddings=True acima),
    a similaridade de cosseno se reduz ao produto escalar simples:
        cos(A, B) = A · B  (quando ||A|| = ||B|| = 1)

    Isso é matematicamente equivalente e computacionalmente mais eficiente.

    Args:
        query_vec: embedding da pergunta, shape (dim,)
        matrix:    embeddings da base, shape (n_chunks, dim)

    Returns:
        scores: array shape (n_chunks,) com valores em [-1, 1]
    """
    # Garante que o vetor da query também está normalizado
    query_norm = query_vec / (np.linalg.norm(query_vec) + 1e-10)
    scores = matrix @ query_norm  # produto escalar com todos os chunks de uma vez
    return scores


def semantic_search(query: str, top_k: int = 2):
    """
    Busca semântica: retorna os chunks mais similares à query.

    Fluxo:
        1. Gera embedding da query (tempo real, ~10-50ms)
        2. Calcula similaridade com todos os chunks via produto escalar
        3. Filtra abaixo do threshold de relevância
        4. Retorna top_k resultados ordenados por score

    Args:
        query:  pergunta do usuário em texto livre
        top_k:  número máximo de resultados

    Returns:
        list[dict]: [{"chunk": str, "score": float, "index": int}]
    """
    # Embedding da query (normalize=True para ficar na mesma escala)
    query_vec = model.encode(query, normalize_embeddings=True, convert_to_numpy=True)

    # Similaridade com todos os chunks
    scores = cosine_similarity_batch(query_vec, KB_EMBEDDINGS)

    # Pega os índices dos top_k mais altos
    top_indices = np.argsort(scores)[::-1][:top_k]

    results = []
    for idx in top_indices:
        score = float(scores[idx])
        if score >= SIMILARITY_THRESHOLD:
            results.append({
                "chunk": KB_CHUNKS[idx],
                "score": round(score, 4),
                "index": int(idx)
            })

    return results

# ─────────────────────────────────────────────
#  FLASK APP
# ─────────────────────────────────────────────

app = Flask(__name__)


@app.route("/health", methods=["GET"])
def health():
    """Verificação de status — chamada pelo Node.js ao inicializar."""
    return jsonify({
        "status": "ok",
        "model": MODEL_NAME,
        "chunks": len(KB_CHUNKS),
        "embeddings_file": EMBEDDINGS_FILE,
        "embeddings_shape": list(KB_EMBEDDINGS.shape),
        "port": PORT
    })


@app.route("/search", methods=["POST"])
def search():
    """
    Endpoint principal usado pelo Node.js.

    Body JSON:
        { "text": "minha geladeira está fazendo barulho", "top_k": 2 }

    Response JSON:
        {
          "results": [
            { "chunk": "...", "score": 0.87, "index": 0 },
            { "chunk": "...", "score": 0.72, "index": 5 }
          ],
          "query": "...",
          "found": true
        }
    """
    body = request.get_json(force=True, silent=True)
    if not body or "text" not in body:
        return jsonify({"error": "Campo 'text' é obrigatório"}), 400

    query  = str(body["text"]).strip()
    top_k  = int(body.get("top_k", 2))

    if not query:
        return jsonify({"error": "O campo 'text' não pode estar vazio"}), 400

    results = semantic_search(query, top_k=top_k)

    # Log para acompanhamento no terminal do Python
    top_score = results[0]["score"] if results else 0
    print(f'[search] "{query[:60]}..." → {len(results)} resultado(s), top score={top_score}')

    return jsonify({
        "results": results,
        "query": query,
        "found": len(results) > 0
    })


@app.route("/embed", methods=["POST"])
def embed():
    """
    Gera e retorna o embedding bruto de um texto.
    Útil para depuração e para demonstração acadêmica.

    Body JSON:
        { "text": "texto qualquer" }

    Response JSON:
        { "embedding": [0.123, -0.456, ...], "dimension": 384 }
    """
    body = request.get_json(force=True, silent=True)
    if not body or "text" not in body:
        return jsonify({"error": "Campo 'text' é obrigatório"}), 400

    text = str(body["text"]).strip()
    vector = model.encode(text, normalize_embeddings=True, convert_to_numpy=True)

    return jsonify({
        "embedding": vector.tolist(),
        "dimension": len(vector)
    })


@app.route("/rebuild", methods=["POST"])
def rebuild():
    """
    Força a reconstrução dos embeddings (apaga .npy e regenera).
    Útil durante desenvolvimento quando a base de conhecimento muda.
    """
    global KB_EMBEDDINGS, KB_CHUNKS

    # Remove arquivos antigos
    for f in [EMBEDDINGS_FILE, CHUNKS_FILE]:
        if os.path.exists(f):
            os.remove(f)
            print(f"[rebuild] Removido: {f}")

    KB_EMBEDDINGS, KB_CHUNKS = build_and_save_embeddings()
    return jsonify({
        "status": "rebuilt",
        "chunks": len(KB_CHUNKS),
        "shape": list(KB_EMBEDDINGS.shape)
    })


# ─────────────────────────────────────────────
#  INICIALIZAÇÃO
# ─────────────────────────────────────────────

if __name__ == "__main__":
    # debug=False em produção para não recarregar o modelo duas vezes
    app.run(host="0.0.0.0", port=PORT, debug=False)