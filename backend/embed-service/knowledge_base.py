# =============================================================================
#  knowledge_base.py
#  Base de conhecimento técnico sobre manutenção de geladeiras.
#
#  Cada chunk é um trecho de texto independente que será:
#    1. Embedado uma única vez pelo embed_service.py
#    2. Salvo em embeddings.npy para reutilização
#    3. Recuperado via busca semântica quando o usuário faz uma pergunta
#
#  Para adicionar novos tópicos: basta acrescentar strings à lista CHUNKS.
# =============================================================================

CHUNKS = [
    # ── Barulhos e Ruídos ────────────────────────────────────────────────────
    """Problema: Geladeira fazendo barulho, ruído, ronco, estralo, zumbido ou vibração.
Causas possíveis:
- Ronco constante forte: compressor desgastado ou suporte solto.
- Estalos esporádicos: dilatação térmica das paredes plásticas — comportamento normal.
- Borbulhamento ou som de água: circulação do gás refrigerante — comportamento normal.
- Vibração excessiva: geladeira fora de nível ou objetos em cima amplificando o som.
- Zumbido alto: ventilador sujo, pá quebrada ou acúmulo de poeira no condensador.
Solução: verificar o nível com pé ajustável, limpar o condensador traseiro, inspecionar
o ventilador do evaporador e checar suportes de borracha do compressor.""",

    # ── Temperatura / Não Gela ───────────────────────────────────────────────
    """Problema: Geladeira não está gelando, está quente por dentro, temperatura alta ou morna.
Causas possíveis:
- Termostato defeituoso: não aciona o compressor na temperatura correta.
- Gás refrigerante baixo (falta de gás): exige recarga por técnico habilitado.
- Compressor com defeito: não pressuriza o gás, requer substituição.
- Borracha de vedação (gaxeta) gasta: ar quente entra, prejudicando o resfriamento.
- Condensador sujo: dissipação de calor prejudicada — limpe as grades traseiras.
- Ventilador interno parado: ar frio não circula — verifique o ventilador do evaporador.
- Geladeira superlotada ou mal organizada: bloqueia a circulação de ar frio.
- Termostato mal ajustado: posição correta é geralmente 3 ou 4 de 5.
Solução: limpar condensador, verificar gaxeta, ajustar termostato. Gás baixo e
compressor exigem técnico especializado.""",

    # ── Vazamento de Água ────────────────────────────────────────────────────
    """Problema: Geladeira vazando água, água no chão, poça embaixo, gotejando ou pingando.
Causas possíveis:
- Dreno do degelo entupido: orifício no fundo do compartimento interno obstruído
  por resíduos; limpe com palito ou seringa com água morna.
- Bandeja de evaporação transbordando: temperatura ambiente alta ou ventilação ruim
  na traseira impede a evaporação correta.
- Gaxeta (borracha) danificada: entrada de ar úmido gera condensação excessiva.
- Mangueira de degelo desconectada ou rachada: substituição simples.
- Porta mal fechada: objetos impedindo o fechamento completo.
- Geladeira fora de nível: água do degelo não escoa — ajuste os pés reguláveis.
Solução: desentupir o dreno, verificar nível e inspecionar a gaxeta.""",

    # ── Excesso de Gelo / Congelamento ───────────────────────────────────────
    """Problema: Acúmulo excessivo de gelo, congelando tudo, gelo demais no freezer ou degelo falhou.
Causas possíveis:
- Termostato ajustado muito alto: regule para posição intermediária.
- Sistema de degelo automático com defeito: temporizador, resistência de degelo
  ou termostato de degelo podem estar falhos.
- Gaxeta com folga: ar úmido entra e forma gelo excessivo no evaporador.
- Porta aberta com frequência: excesso de umidade acumulada.
- Geladeira Frost Free: se acumula gelo, o sistema de degelo automático parou —
  verifique a resistência de degelo e o timer.
Solução: ajustar termostato, testar gaxeta com folha de papel, checar timer e
resistência de degelo (modelo Frost Free).""",

    # ── Consumo de Energia ───────────────────────────────────────────────────
    """Problema: Conta de luz alta, geladeira consumindo muita energia elétrica, gasto elevado.
Causas possíveis:
- Condensador sujo: compressor trabalha mais para dissipar calor — limpe as grades.
- Borracha de vedação gasta: ar quente entra e o compressor compensa continuamente.
- Abertura excessiva de portas: cada abertura introduz ar quente no interior.
- Alimentos quentes colocados diretamente: sempre deixe esfriar antes.
- Local inadequado: próximo ao fogão, forno ou exposição solar direta aumenta consumo;
  mantenha 15 cm de afastamento da parede para ventilação.
- Compressor desgastado: consome mais energia do que o projeto original.
- Modelo antigo: geladeiras com mais de 10 anos consomem até 3× mais que modelos
  atuais com etiqueta Procel classe A.
Solução: limpar condensador mensalmente, verificar vedação, posicionar longe de fontes de calor.""",

    # ── Odores ───────────────────────────────────────────────────────────────
    """Problema: Cheiro ruim na geladeira, mau odor, fedor dentro da geladeira.
Causas possíveis:
- Alimentos estragados ou sem tampa: retire, descarte e limpe com água e bicarbonato.
- Borracha da porta com mofo: limpe com esponja e solução de água com vinagre branco.
- Dreno de degelo com resíduos orgânicos: acumula bactérias — limpe o dreno e a bandeja.
- Ausência de absorventes de odor: coloque bicarbonato de sódio ou carvão ativado
  em recipiente aberto dentro da geladeira.
Solução: higienizar internamente, limpar dreno e gaxeta, manter alimentos sempre tampados.""",

    # ── Geladeira Não Liga ───────────────────────────────────────────────────
    """Problema: Geladeira não liga, parou de funcionar, desligou sozinha ou não tem energia.
Causas possíveis:
- Tomada com defeito ou disjuntor desarmado: teste outro aparelho na mesma tomada.
- Cabo de alimentação danificado: inspecione visualmente cortes ou dobras forçadas.
- Protetor térmico do compressor desarmado por superaquecimento: aguarde 30 min
  com a geladeira desligada e tente novamente.
- Termostato na posição OFF: alguns modelos têm posição de desligamento total.
- Placa eletrônica com defeito (modelos digitais): requer diagnóstico técnico.
- Compressor queimado: ausência do ruído característico ao ligar indica compressor inativo.
Solução: verificar tomada e disjuntor primeiro; se persistir, chamar técnico.""",

    # ── Porta e Vedação (Gaxeta) ──────────────────────────────────────────────
    """Problema: Porta da geladeira com vedação ruim, borracha (gaxeta) danificada, não fecha bem.
Causas possíveis:
- Gaxeta desgastada: não veda corretamente, permite entrada de ar quente.
- Gaxeta deformada: pode ser reativada com secador de cabelo em temperatura baixa
  para recuperar a flexibilidade.
- Porta desalinhada: dobradiças desreguladas — ajuste com chave de fenda.
- Resíduos na borracha: sujeira impede o contato completo com a estrutura.
Teste: coloque uma folha de papel na porta ao fechar; se sair facilmente, a vedação falhou.
Solução: limpar com pano úmido e detergente neutro; substituir se deformada; gaxetas são
peças baratas e podem ser trocadas sem técnico na maioria dos modelos.""",

    # ── Luz Interna ──────────────────────────────────────────────────────────
    """Problema: Luz interna da geladeira não acende, lâmpada apagou, iluminação com defeito.
Causas possíveis:
- Lâmpada queimada: substitua por lâmpada compatível com o modelo (LED ou incandescente).
- Interruptor de porta com defeito: pequeno botão na lateral interna que ativa a luz
  quando a porta abre — pode estar preso, quebrado ou com contato ruim.
- Problema no chicote elétrico interno: menos comum; requer técnico especializado.
Solução: testar trocando a lâmpada primeiro; depois verificar o botão do interruptor.""",

    # ── Compressor ───────────────────────────────────────────────────────────
    """Problema: Compressor com problema, motor barulhento, liga e desliga muito rápido,
geladeira aquece na traseira, ciclo curto ou compressor não para.
Causas possíveis:
- Calor moderado na traseira: normal — condensador dissipando calor. Calor excessivo
  indica condensador sujo ou ventilação insuficiente.
- Curto-ciclo (liga e desliga rapidamente): protetor térmico atuando por superaquecimento,
  ou nível de gás refrigerante baixo.
- Compressor que nunca para: termostato defeituoso ou gás insuficiente.
- Ruído metálico no compressor: desgaste interno — avalie substituição.
- Vida útil: 10 a 15 anos em média; após esse período, falhas se tornam mais frequentes.
Solução: limpar condensador, verificar nível e ventilação. Problemas internos do
compressor exigem técnico — substituição pode ser necessária.""",

    # ── Manutenção Preventiva ─────────────────────────────────────────────────
    """Manutenção preventiva e dicas gerais para geladeiras.
- Limpe o condensador (grades traseiras ou inferiores) a cada 3 meses com escova macia.
- Verifique a gaxeta mensalmente com o teste da folha de papel.
- Descongele o freezer manual quando a camada de gelo passar de 1 cm.
- Mantenha pelo menos 15 cm de espaço na traseira e nas laterais para ventilação.
- Evite colocar a geladeira próxima ao fogão, forno ou em exposição ao sol.
- Não coloque alimentos quentes diretamente — deixe atingir temperatura ambiente.
- Organize os alimentos para não bloquear as saídas de ar frio.
- Verifique e limpe o dreno de degelo a cada 6 meses.
- Ligue a geladeira 12 horas antes de colocar alimentos (instalação nova).
- Em caso de mudança, transporte sempre na posição vertical; aguarde 2h antes de ligar.""",

    # ── Degelo Manual ────────────────────────────────────────────────────────
    """Procedimento de degelo manual da geladeira ou freezer.
- Esvazie todos os alimentos e guarde em caixas com gelo.
- Desligue a geladeira da tomada.
- Deixe a porta aberta; o gelo derreterá naturalmente em 2 a 4 horas.
- Para acelerar: coloque tigelas com água quente (não fervendo) dentro do compartimento.
- NUNCA use objetos pontiagudos para raspar o gelo — podem perfurar o evaporador.
- NUNCA use secador de cabelo diretamente no evaporador — risco de choque elétrico.
- Ao terminar, seque bem o interior e o dreno antes de religar.
- Espere 15 minutos após religar antes de colocar os alimentos de volta.""",

# ── Gelando Demais / Congelando Alimentos ─────────────────────────────
    """Problema: Geladeira gelando demais, congelando alimentos na parte de baixo (refrigerador).
Causas possíveis:
- Termostato regulado para uma temperatura muito baixa (fria).
- Sensor de temperatura com defeito ou fora da posição.
- Damper (porta que controla a passagem de ar frio do freezer para a geladeira) travado aberto.
Solução: Reduza a regulagem de temperatura no painel. Se não resolver, o sensor ou o damper precisam ser testados por um técnico."""
]

