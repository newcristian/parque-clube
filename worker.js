/*
============================================================
 PARQUE CLUBE - CLOUDFLARE WORKER V4.7
 Sistema de Chamados / Ordem de Serviço

 D1 Binding: DB
 Secret: ADMIN_PASSWORD
 API: /api/protocolo

 V4.7:
 - WhatsApp para retorno salvo no chamado
 - Observação da solução usada como resposta da Administração e no WhatsApp
 - Consulta/listagem devolve os dois campos
 - Preserva resposta anterior quando update não envia resposta
 - Mantém chamados, prioridade, arquivamento e módulo
   Advertências / Notificações
============================================================
*/

function resposta(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function obterDataBrasilia() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());

  return {
    ano: partes.find(p => p.type === "year").value,
    mes: partes.find(p => p.type === "month").value,
    dia: partes.find(p => p.type === "day").value
  };
}

function obterHoraBrasilia() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(new Date());
}

function dataHoraBrasilia() {
  const d = obterDataBrasilia();
  return `${d.dia}/${d.mes}/${d.ano} ${obterHoraBrasilia()}`;
}

function verificarSenha(dados, env) {
  const senhaAdmin = String(env.ADMIN_PASSWORD || "").trim();
  const senhaInformada = String(dados.adminPassword || "").trim();

  if (!senhaAdmin) {
    return {
      ok: false,
      resposta: resposta({
        sucesso: false,
        erro: "A senha administrativa não está configurada no Cloudflare."
      }, 500)
    };
  }

  if (!senhaInformada || senhaInformada !== senhaAdmin) {
    return {
      ok: false,
      resposta: resposta({
        sucesso: false,
        erro: "Senha administrativa incorreta."
      }, 401)
    };
  }

  return { ok: true };
}

/* =========================================================
   MIGRAÇÕES SEGURAS DO D1
========================================================= */

async function colunaExiste(env, tabela, coluna) {
  const info = await env.DB.prepare(`PRAGMA table_info(${tabela})`).all();
  return (info.results || []).some(c => c.name === coluna);
}

async function garantirColuna(env, tabela, coluna, definicao) {
  if (!(await colunaExiste(env, tabela, coluna))) {
    await env.DB.prepare(
      `ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`
    ).run();
  }
}

async function garantirEstruturaChamados(env) {
  /* Estas duas colunas são a correção da V4.7 */
  await garantirColuna(env, "chamados", "whatsapp_retorno", "TEXT DEFAULT ''");
  await garantirColuna(env, "chamados", "resposta_administracao", "TEXT DEFAULT ''");

  /* Mantém compatibilidade com a versão que já usa prioridade */
  await garantirColuna(env, "chamados", "prioridade", "TEXT DEFAULT 'Moderada'");

  /* Campos usados pelas versões anteriores */
  await garantirColuna(env, "chamados", "data_conclusao", "TEXT DEFAULT ''");
  await garantirColuna(env, "chamados", "hora_conclusao", "TEXT DEFAULT ''");
  await garantirColuna(env, "chamados", "ultima_atualizacao", "TEXT DEFAULT ''");
}

/* =========================================================
   ARQUIVAMENTO
========================================================= */

async function garantirTabelaArquivamento(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS chamados_arquivamento (
      protocolo TEXT PRIMARY KEY,
      arquivado INTEGER NOT NULL DEFAULT 0,
      data_ultimo_arquivamento TEXT DEFAULT '',
      data_ultima_reabertura TEXT DEFAULT '',
      historico_json TEXT DEFAULT '[]'
    )
  `).run();
}

async function buscarArquivamento(env, protocolo) {
  await garantirTabelaArquivamento(env);

  return env.DB.prepare(`
    SELECT *
    FROM chamados_arquivamento
    WHERE protocolo = ?
    LIMIT 1
  `).bind(protocolo).first();
}

/* =========================================================
   CONVERTER CHAMADO
========================================================= */

function converterChamado(row, arquivo = null) {
  if (!row) return null;

  let historicoArquivamento = [];
  try {
    historicoArquivamento = arquivo && arquivo.historico_json
      ? JSON.parse(arquivo.historico_json)
      : [];
  } catch {
    historicoArquivamento = [];
  }

  return {
    id: row.id,
    protocolo: row.protocolo,
    dataAbertura: row.data_abertura || "",
    horaAbertura: row.hora_abertura || "",
    status: row.status || "Aberto",
    solicitante: row.solicitante || "",
    cargo: row.cargo || "",
    bloco: row.bloco || "",
    pavimentos: row.pavimentos || "",
    ocorrencia: row.ocorrencia || row.tipo_ocorrencia || "",
    dataOcorrencia: row.data_ocorrencia || "",
    horaInicial: row.hora_inicial || "",
    horaFinal: row.hora_final || "",
    detalhes: row.detalhes || "",
    responsavel: row.responsavel || "",
    observacaoSolucao: row.observacao_solucao || "",
    dataConclusao: row.data_conclusao || "",
    horaConclusao: row.hora_conclusao || "",
    ultimaAtualizacao: row.ultima_atualizacao || "",
    criadoEm: row.criado_em || "",
    prioridade: row.prioridade || "Moderada",

    /* V4.7 */
    whatsappRetorno: row.whatsapp_retorno || "",
    respostaAdministracao: row.resposta_administracao || "",

    arquivado: arquivo ? Number(arquivo.arquivado || 0) === 1 : false,
    dataHoraArquivamento: arquivo?.data_ultimo_arquivamento || "",
    dataHoraReabertura: arquivo?.data_ultima_reabertura || "",
    historicoArquivamento
  };
}

/* =========================================================
   BUSCAR / LISTAR CHAMADOS
========================================================= */

async function buscarChamado(env, protocolo) {
  await garantirEstruturaChamados(env);

  const row = await env.DB.prepare(`
    SELECT *
    FROM chamados
    WHERE protocolo = ?
    LIMIT 1
  `).bind(protocolo).first();

  const arquivo = await buscarArquivamento(env, protocolo);
  return converterChamado(row, arquivo);
}

async function listarChamados(env) {
  await garantirEstruturaChamados(env);
  await garantirTabelaArquivamento(env);

  const resultado = await env.DB.prepare(`
    SELECT *
    FROM chamados
    ORDER BY id DESC
  `).all();

  const arquivos = await env.DB.prepare(`
    SELECT *
    FROM chamados_arquivamento
  `).all();

  const mapaArquivos = new Map(
    (arquivos.results || []).map(item => [item.protocolo, item])
  );

  const todos = (resultado.results || []).map(row =>
    converterChamado(row, mapaArquivos.get(row.protocolo) || null)
  );

  const chamados = todos.filter(c => !c.arquivado);
  const chamadosArquivados = todos.filter(c => c.arquivado);

  const estatisticas = {
    total: chamados.length,
    abertos: chamados.filter(c => c.status === "Aberto").length,
    andamento: chamados.filter(c => c.status === "Em andamento").length,
    resolvidos: chamados.filter(c => c.status === "Resolvido").length,
    cancelados: chamados.filter(c => c.status === "Cancelado").length
  };

  return { chamados, chamadosArquivados, estatisticas };
}

/* =========================================================
   CRIAR CHAMADO
========================================================= */

async function criarChamado(env, dados) {
  await garantirEstruturaChamados(env);

  const data = obterDataBrasilia();
  const hora = obterHoraBrasilia();
  const dataContador = `${data.ano}-${data.mes}-${data.dia}`;

  const contador = await env.DB.prepare(`
    INSERT INTO contadores (data, numero)
    VALUES (?, 1)
    ON CONFLICT(data)
    DO UPDATE SET numero = numero + 1
    RETURNING numero
  `).bind(dataContador).first();

  if (!contador) {
    return resposta({
      sucesso: false,
      erro: "Não foi possível gerar o número do protocolo."
    }, 503);
  }

  const sequencial = String(Number(contador.numero)).padStart(3, "0");
  const protocolo = `PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-${sequencial}`;

  const prioridadesPermitidas = ["Urgente", "Alta", "Moderada", "Baixa"];
  const prioridadeInformada = String(dados.prioridade || "Moderada").trim();
  const prioridade = prioridadesPermitidas.includes(prioridadeInformada)
    ? prioridadeInformada
    : "Moderada";

  const chamado = {
    protocolo,
    dataAbertura: `${data.dia}/${data.mes}/${data.ano}`,
    horaAbertura: hora,
    status: "Aberto",
    solicitante: dados.solicitante || "",
    cargo: dados.cargo || "",
    bloco: dados.bloco || "",
    pavimentos: dados.pavimentos || "",
    ocorrencia: dados.ocorrencia || dados.tipo_ocorrencia || "",
    dataOcorrencia: dados.dataOcorrencia || "",
    horaInicial: dados.horaInicial || "",
    horaFinal: dados.horaFinal || "",
    detalhes: dados.detalhes || "",
    responsavel: "",
    observacaoSolucao: "",
    prioridade,
    whatsappRetorno: String(dados.whatsappRetorno || "").trim(),
    respostaAdministracao: "",
    criadoEm: new Date().toISOString()
  };

  await env.DB.prepare(`
    INSERT INTO chamados (
      protocolo,
      data_abertura,
      hora_abertura,
      status,
      solicitante,
      cargo,
      bloco,
      pavimentos,
      ocorrencia,
      data_ocorrencia,
      hora_inicial,
      hora_final,
      detalhes,
      responsavel,
      observacao_solucao,
      prioridade,
      whatsapp_retorno,
      resposta_administracao,
      criado_em
    )
    VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).bind(
    chamado.protocolo,
    chamado.dataAbertura,
    chamado.horaAbertura,
    chamado.status,
    chamado.solicitante,
    chamado.cargo,
    chamado.bloco,
    chamado.pavimentos,
    chamado.ocorrencia,
    chamado.dataOcorrencia,
    chamado.horaInicial,
    chamado.horaFinal,
    chamado.detalhes,
    chamado.responsavel,
    chamado.observacaoSolucao,
    chamado.prioridade,
    chamado.whatsappRetorno,
    chamado.respostaAdministracao,
    chamado.criadoEm
  ).run();

  return resposta({
    sucesso: true,
    mensagem: "Chamado registrado com sucesso.",
    protocolo,
    chamado
  });
}

/* =========================================================
   ATUALIZAR CHAMADO
========================================================= */

async function atualizarChamado(env, dados) {
  await garantirEstruturaChamados(env);

  if (!dados.protocolo) {
    return resposta({
      sucesso: false,
      erro: "Informe o protocolo."
    }, 400);
  }

  const protocolo = String(dados.protocolo).trim().toUpperCase();
  const chamadoAtual = await buscarChamado(env, protocolo);

  if (!chamadoAtual) {
    return resposta({
      sucesso: false,
      erro: "Protocolo não encontrado."
    }, 404);
  }

  const statusPermitidos = ["Aberto", "Em andamento", "Resolvido", "Cancelado"];
  const status = dados.status || chamadoAtual.status || "Aberto";

  if (!statusPermitidos.includes(status)) {
    return resposta({
      sucesso: false,
      erro: "Status inválido."
    }, 400);
  }

  const data = obterDataBrasilia();
  const hora = obterHoraBrasilia();

  let dataConclusao = chamadoAtual.dataConclusao || "";
  let horaConclusao = chamadoAtual.horaConclusao || "";

  if (status === "Resolvido") {
    dataConclusao = `${data.dia}/${data.mes}/${data.ano}`;
    horaConclusao = hora;
  } else if (status !== "Resolvido") {
    dataConclusao = "";
    horaConclusao = "";
  }

  const prioridadesPermitidas = ["Urgente", "Alta", "Moderada", "Baixa"];
  const prioridadeInformada =
    dados.prioridade !== undefined
      ? String(dados.prioridade || "").trim()
      : chamadoAtual.prioridade;

  const prioridade = prioridadesPermitidas.includes(prioridadeInformada)
    ? prioridadeInformada
    : (chamadoAtual.prioridade || "Moderada");

  /*
   * V4.7:
   * A Observação da solução passou a ser a única resposta administrativa.
   * Para manter compatibilidade com registros antigos, o campo
   * resposta_administracao continua existindo no banco, mas recebe
   * exatamente o mesmo texto de observacao_solucao.
   */
  const possuiObservacaoSolucao =
    Object.prototype.hasOwnProperty.call(dados, "observacaoSolucao");

  const observacaoSolucao = possuiObservacaoSolucao
    ? String(dados.observacaoSolucao || "").trim()
    : (chamadoAtual.observacaoSolucao || "");

  const respostaAdministracao = observacaoSolucao;

  const ultimaAtualizacao = `${data.dia}/${data.mes}/${data.ano} ${hora}`;

  await env.DB.prepare(`
    UPDATE chamados
    SET
      status = ?,
      responsavel = ?,
      observacao_solucao = ?,
      data_conclusao = ?,
      hora_conclusao = ?,
      ultima_atualizacao = ?,
      prioridade = ?,
      resposta_administracao = ?
    WHERE protocolo = ?
  `).bind(
    status,
    dados.responsavel !== undefined
      ? String(dados.responsavel || "")
      : chamadoAtual.responsavel,
    observacaoSolucao,
    dataConclusao,
    horaConclusao,
    ultimaAtualizacao,
    prioridade,
    respostaAdministracao,
    protocolo
  ).run();

  const atualizado = await buscarChamado(env, protocolo);

  return resposta({
    sucesso: true,
    mensagem: "Chamado atualizado com sucesso.",
    chamado: atualizado
  });
}

/* =========================================================
   ARQUIVAR / REABRIR / EXCLUIR
========================================================= */

async function arquivarChamado(env, dados) {
  if (!dados.protocolo) {
    return resposta({ sucesso: false, erro: "Informe o protocolo." }, 400);
  }

  const protocolo = String(dados.protocolo).trim().toUpperCase();
  const chamado = await buscarChamado(env, protocolo);

  if (!chamado) {
    return resposta({ sucesso: false, erro: "Protocolo não encontrado." }, 404);
  }

  if (chamado.status !== "Resolvido") {
    return resposta({
      sucesso: false,
      erro: "Somente chamados resolvidos podem ser arquivados."
    }, 400);
  }

  await garantirTabelaArquivamento(env);

  const agora = dataHoraBrasilia();
  let historico = chamado.historicoArquivamento || [];
  historico.push({ tipo: "ARQUIVADO", dataHora: agora });

  await env.DB.prepare(`
    INSERT INTO chamados_arquivamento (
      protocolo, arquivado, data_ultimo_arquivamento, historico_json
    )
    VALUES (?, 1, ?, ?)
    ON CONFLICT(protocolo)
    DO UPDATE SET
      arquivado = 1,
      data_ultimo_arquivamento = excluded.data_ultimo_arquivamento,
      historico_json = excluded.historico_json
  `).bind(protocolo, agora, JSON.stringify(historico)).run();

  return resposta({
    sucesso: true,
    mensagem: "Chamado arquivado com sucesso.",
    chamado: await buscarChamado(env, protocolo)
  });
}

async function reabrirChamado(env, dados) {
  if (!dados.protocolo) {
    return resposta({ sucesso: false, erro: "Informe o protocolo." }, 400);
  }

  const protocolo = String(dados.protocolo).trim().toUpperCase();
  const chamado = await buscarChamado(env, protocolo);

  if (!chamado) {
    return resposta({ sucesso: false, erro: "Protocolo não encontrado." }, 404);
  }

  await garantirTabelaArquivamento(env);

  const agora = dataHoraBrasilia();
  let historico = chamado.historicoArquivamento || [];
  historico.push({ tipo: "REABERTO", dataHora: agora });

  await env.DB.prepare(`
    INSERT INTO chamados_arquivamento (
      protocolo, arquivado, data_ultima_reabertura, historico_json
    )
    VALUES (?, 0, ?, ?)
    ON CONFLICT(protocolo)
    DO UPDATE SET
      arquivado = 0,
      data_ultima_reabertura = excluded.data_ultima_reabertura,
      historico_json = excluded.historico_json
  `).bind(protocolo, agora, JSON.stringify(historico)).run();

  return resposta({
    sucesso: true,
    mensagem: "Chamado reaberto com sucesso.",
    chamado: await buscarChamado(env, protocolo)
  });
}

async function excluirChamado(env, dados) {
  if (!dados.protocolo) {
    return resposta({ sucesso: false, erro: "Informe o protocolo." }, 400);
  }

  const protocolo = String(dados.protocolo).trim().toUpperCase();
  const chamado = await buscarChamado(env, protocolo);

  if (!chamado) {
    return resposta({ sucesso: false, erro: "Protocolo não encontrado." }, 404);
  }

  await garantirTabelaArquivamento(env);

  await env.DB.prepare(`
    DELETE FROM chamados
    WHERE protocolo = ?
  `).bind(protocolo).run();

  await env.DB.prepare(`
    DELETE FROM chamados_arquivamento
    WHERE protocolo = ?
  `).bind(protocolo).run();

  return resposta({
    sucesso: true,
    mensagem: "Chamado excluído com sucesso.",
    protocolo
  });
}

/* =========================================================
   LOGIN / CONSULTA
========================================================= */

async function login(env, dados) {
  const autenticacao = verificarSenha(dados, env);
  if (!autenticacao.ok) return autenticacao.resposta;

  return resposta({
    sucesso: true,
    mensagem: "Acesso administrativo autorizado."
  });
}

async function consultarProtocolo(env, protocolo) {
  if (!protocolo) {
    return resposta({
      encontrado: false,
      erro: "Informe o número do protocolo."
    }, 400);
  }

  const protocoloNormalizado = String(protocolo).trim().toUpperCase();
  const chamado = await buscarChamado(env, protocoloNormalizado);

  if (!chamado) {
    return resposta({
      encontrado: false,
      erro: "Protocolo não encontrado."
    }, 404);
  }

  return resposta({
    encontrado: true,
    chamado
  });
}

/* =========================================================
   ADVERTÊNCIAS / NOTIFICAÇÕES
========================================================= */

function obterDBAdministrativo(env) {
  if (!env || !env.DB || typeof env.DB.prepare !== "function") {
    throw new Error("Binding D1 'DB' não encontrado ou inválido.");
  }
  return env.DB;
}

async function garantirTabelasAdministrativas(env) {
  const db = obterDBAdministrativo(env);

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS contadores_administrativos (
      ano INTEGER PRIMARY KEY,
      numero INTEGER NOT NULL DEFAULT 0
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS advertencias_notificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocolo TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL,
      data_registro TEXT NOT NULL,
      data_ocorrencia TEXT DEFAULT '',
      bloco TEXT NOT NULL,
      unidade TEXT NOT NULL,
      infracao TEXT NOT NULL,
      descricao TEXT DEFAULT '',
      base_regimento TEXT DEFAULT '',
      responsavel TEXT DEFAULT '',
      observacoes TEXT DEFAULT '',
      protocolo_chamado TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Registrada',
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    )
  `).run();
}

function converterMedidaAdministrativa(row) {
  if (!row) return null;

  return {
    id: row.id,
    protocolo: row.protocolo,
    tipo: row.tipo,
    dataRegistro: row.data_registro || "",
    dataOcorrencia: row.data_ocorrencia || "",
    bloco: row.bloco || "",
    unidade: row.unidade || "",
    infracao: row.infracao || "",
    descricao: row.descricao || "",
    baseRegimento: row.base_regimento || "",
    responsavel: row.responsavel || "",
    observacoes: row.observacoes || "",
    protocoloChamado: row.protocolo_chamado || "",
    status: row.status || "Registrada",
    criadoEm: row.criado_em || "",
    atualizadoEm: row.atualizado_em || ""
  };
}

async function listarMedidasAdministrativas(env) {
  const db = obterDBAdministrativo(env);
  await garantirTabelasAdministrativas(env);

  const resultado = await db.prepare(`
    SELECT *
    FROM advertencias_notificacoes
    ORDER BY id DESC
  `).all();

  return (resultado.results || [])
    .map(converterMedidaAdministrativa)
    .filter(Boolean);
}

async function gerarProtocoloAdministrativo(env) {
  const db = obterDBAdministrativo(env);
  await garantirTabelasAdministrativas(env);

  const data = obterDataBrasilia();
  const ano = Number(data.ano);

  await db.prepare(`
    INSERT INTO contadores_administrativos (ano, numero)
    VALUES (?, 1)
    ON CONFLICT(ano)
    DO UPDATE SET numero = numero + 1
  `).bind(ano).run();

  const contador = await db.prepare(`
    SELECT numero
    FROM contadores_administrativos
    WHERE ano = ?
    LIMIT 1
  `).bind(ano).first();

  const numero = Number(contador?.numero || 0);

  if (!numero) {
    throw new Error("Não foi possível gerar o protocolo administrativo.");
  }

  return `ADM-${ano}-${String(numero).padStart(4, "0")}`;
}

async function criarMedidaAdministrativa(env, dados) {
  const db = obterDBAdministrativo(env);
  await garantirTabelasAdministrativas(env);

  const tipo = String(dados.tipo || "").trim();
  const tiposPermitidos = ["Advertência", "Notificação"];

  if (!tiposPermitidos.includes(tipo)) {
    return resposta({
      sucesso: false,
      erro: "Tipo administrativo inválido."
    }, 400);
  }

  const bloco = String(dados.bloco || "").trim();
  const unidade = String(dados.unidade || "").trim();
  const infracao = String(dados.infracao || "").trim();

  if (!bloco || !unidade || !infracao) {
    return resposta({
      sucesso: false,
      erro: "Informe bloco, unidade e infração."
    }, 400);
  }

  const data = obterDataBrasilia();
  const agora = `${data.dia}/${data.mes}/${data.ano} ${obterHoraBrasilia()}`;
  const protocolo = await gerarProtocoloAdministrativo(env);

  const medida = {
    protocolo,
    tipo,
    dataRegistro: dados.dataRegistro || `${data.dia}/${data.mes}/${data.ano}`,
    dataOcorrencia: dados.dataOcorrencia || "",
    bloco,
    unidade,
    infracao,
    descricao: dados.descricao || "",
    baseRegimento: dados.baseRegimento || "",
    responsavel: dados.responsavel || "",
    observacoes: dados.observacoes || "",
    protocoloChamado: dados.protocoloChamado || "",
    status: dados.status || "Registrada",
    criadoEm: agora,
    atualizadoEm: agora
  };

  await db.prepare(`
    INSERT INTO advertencias_notificacoes (
      protocolo, tipo, data_registro, data_ocorrencia,
      bloco, unidade, infracao, descricao,
      base_regimento, responsavel, observacoes,
      protocolo_chamado, status, criado_em, atualizado_em
    )
    VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
  `).bind(
    medida.protocolo,
    medida.tipo,
    medida.dataRegistro,
    medida.dataOcorrencia,
    medida.bloco,
    medida.unidade,
    medida.infracao,
    medida.descricao,
    medida.baseRegimento,
    medida.responsavel,
    medida.observacoes,
    medida.protocoloChamado,
    medida.status,
    medida.criadoEm,
    medida.atualizadoEm
  ).run();

  return resposta({
    sucesso: true,
    mensagem: "Registro administrativo criado com sucesso.",
    medida
  });
}

async function excluirMedidaAdministrativa(env, dados) {
  const db = obterDBAdministrativo(env);
  await garantirTabelasAdministrativas(env);

  const protocolo = String(dados.protocolo || "").trim().toUpperCase();

  if (!protocolo) {
    return resposta({
      sucesso: false,
      erro: "Informe o protocolo administrativo."
    }, 400);
  }

  const registro = await db.prepare(`
    SELECT id
    FROM advertencias_notificacoes
    WHERE protocolo = ?
    LIMIT 1
  `).bind(protocolo).first();

  if (!registro) {
    return resposta({
      sucesso: false,
      erro: "Registro administrativo não encontrado."
    }, 404);
  }

  await db.prepare(`
    DELETE FROM advertencias_notificacoes
    WHERE protocolo = ?
  `).bind(protocolo).run();

  return resposta({
    sucesso: true,
    mensagem: "Registro administrativo excluído com sucesso.",
    protocolo
  });
}

/* =========================================================
   SERVIR INDEX
========================================================= */

async function servirIndex(request, env) {
  return env.ASSETS.fetch(
    new Request(new URL("/index.html", request.url), request)
  );
}

/* =========================================================
   WORKER PRINCIPAL
========================================================= */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return resposta({ sucesso: true });
    }

    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      const ehAPI =
        pathname === "/api/protocolo" ||
        pathname === "/.netlify/functions/protocolo";

      if (request.method === "GET" && ehAPI) {
        return consultarProtocolo(
          env,
          url.searchParams.get("protocolo")
        );
      }

      if (
        request.method === "GET" &&
        pathname === "/" &&
        url.searchParams.has("protocolo")
      ) {
        return consultarProtocolo(
          env,
          url.searchParams.get("protocolo")
        );
      }

      if (request.method === "GET" && pathname === "/") {
        return servirIndex(request, env);
      }

      if (request.method === "GET") {
        return env.ASSETS.fetch(request);
      }

      if (request.method !== "POST") {
        return resposta({
          sucesso: false,
          erro: "Método não permitido."
        }, 405);
      }

      let dados;
      try {
        dados = await request.json();
      } catch {
        return resposta({
          sucesso: false,
          erro: "Dados inválidos."
        }, 400);
      }

      if (dados.action === "login") {
        return login(env, dados);
      }

      if (dados.action === "list") {
        const autenticacao = verificarSenha(dados, env);
        if (!autenticacao.ok) return autenticacao.resposta;

        const resultado = await listarChamados(env);

        return resposta({
          sucesso: true,
          chamados: resultado.chamados,
          chamadosArquivados: resultado.chamadosArquivados,
          estatisticas: resultado.estatisticas
        });
      }

      if (dados.action === "listAdministrative") {
        const autenticacao = verificarSenha(dados, env);
        if (!autenticacao.ok) return autenticacao.resposta;

        const medidas = await listarMedidasAdministrativas(env);
        return resposta({ sucesso: true, medidas });
      }

      if (dados.action === "createAdministrative") {
        const autenticacao = verificarSenha(dados, env);
        if (!autenticacao.ok) return autenticacao.resposta;
        return criarMedidaAdministrativa(env, dados);
      }

      if (dados.action === "deleteAdministrative") {
        const autenticacao = verificarSenha(dados, env);
        if (!autenticacao.ok) return autenticacao.resposta;
        return excluirMedidaAdministrativa(env, dados);
      }

      if (dados.action === "update") {
        const autenticacao = verificarSenha(dados, env);
        if (!autenticacao.ok) return autenticacao.resposta;
        return atualizarChamado(env, dados);
      }

      if (dados.action === "archive") {
        const autenticacao = verificarSenha(dados, env);
        if (!autenticacao.ok) return autenticacao.resposta;
        return arquivarChamado(env, dados);
      }

      if (dados.action === "reopen") {
        const autenticacao = verificarSenha(dados, env);
        if (!autenticacao.ok) return autenticacao.resposta;
        return reabrirChamado(env, dados);
      }

      if (dados.action === "delete") {
        const autenticacao = verificarSenha(dados, env);
        if (!autenticacao.ok) return autenticacao.resposta;
        return excluirChamado(env, dados);
      }

      /* Sem action = criação normal do chamado */
      return criarChamado(env, dados);

    } catch (erro) {
      console.error("ERRO NO WORKER:", erro);

      return resposta({
        sucesso: false,
        erro: "Erro interno no sistema.",
        detalhe: erro?.message || String(erro)
      }, 500);
    }
  }
};
