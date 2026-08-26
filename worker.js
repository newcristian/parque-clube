/ PARQUE CLUBE - CLOUDFLARE WORKER Binding D1: DB Secret: ADMIN_PASSWORD
Assets: ASSETS /

function resposta(dados, status = 200) { return new
Response(JSON.stringify(dados), { status, headers: { “Content-Type”:
“application/json; charset=UTF-8”, “Access-Control-Allow-Origin”:
“*“,”Access-Control-Allow-Methods”: “GET, POST, OPTIONS”,
“Access-Control-Allow-Headers”: “Content-Type” } }); }

function obterDataBrasilia() { const p = new
Intl.DateTimeFormat(“en-CA”, { timeZone: “America/Sao_Paulo”, year:
“numeric”, month: “2-digit”, day: “2-digit” }).formatToParts(new
Date()); return { ano: p.find(x => x.type === “year”).value, mes:
p.find(x => x.type === “month”).value, dia: p.find(x => x.type ===
“day”).value }; }

function obterHoraBrasilia() { return new Intl.DateTimeFormat(“pt-BR”, {
timeZone: “America/Sao_Paulo”, hour: “2-digit”, minute: “2-digit”,
second: “2-digit”, hour12: false }).format(new Date()); }

function dataHoraBrasilia() { const d = obterDataBrasilia(); return
${d.dia}/${d.mes}/${d.ano} ${obterHoraBrasilia()}; }

function verificarSenha(dados, env) { const senhaAdmin =
String(env.ADMIN_PASSWORD || ““).trim(); const senhaInformada =
String(dados.adminPassword ||”“).trim();

if (!senhaAdmin) { return { ok: false, resposta: resposta({ sucesso:
false, erro: “A senha administrativa não está configurada no
Cloudflare.” }, 500) }; }

if (!senhaInformada || senhaInformada !== senhaAdmin) { return { ok:
false, resposta: resposta({ sucesso: false, erro: “Senha administrativa
incorreta.” }, 401) }; }

return { ok: true }; }

function primeiroValor(dados, campos, padrao = ““) { for (const campo of
campos) { if (dados[campo] !== undefined && dados[campo] !== null &&
String(dados[campo]).trim() !==”“) { return String(dados[campo]).trim();
} } return padrao; }

async function colunaExiste(env, tabela, coluna) { const info = await
env.DB.prepare(PRAGMA table_info(${tabela})).all(); return (info.results
|| []).some(c => c.name === coluna); }

async function garantirColuna(env, tabela, coluna, definicao) { if
(!await colunaExiste(env, tabela, coluna)) { await env.DB.prepare(
ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao} ).run(); } }

async function garantirEstruturaChamados(env) { await
env.DB.prepare(CREATE TABLE IF NOT EXISTS chamados (       id INTEGER PRIMARY KEY AUTOINCREMENT,       protocolo TEXT NOT NULL UNIQUE,       data_abertura TEXT DEFAULT '',       hora_abertura TEXT DEFAULT '',       status TEXT DEFAULT 'Aberto',       solicitante TEXT DEFAULT '',       cargo TEXT DEFAULT '',       bloco TEXT DEFAULT '',       pavimentos TEXT DEFAULT '',       ocorrencia TEXT DEFAULT '',       detalhes TEXT DEFAULT '',       responsavel TEXT DEFAULT '',       observacao_solucao TEXT DEFAULT ''     )).run();

await
env.DB.prepare(CREATE TABLE IF NOT EXISTS contadores (       data TEXT PRIMARY KEY,       numero INTEGER NOT NULL DEFAULT 0     )).run();

const cols = [ [“data_ocorrencia”, “TEXT DEFAULT ’’”], [“hora_inicial”,
“TEXT DEFAULT ’’”], [“hora_final”, “TEXT DEFAULT ’’”],
[“whatsapp_retorno”, “TEXT DEFAULT ’’”], [“resposta_administracao”,
“TEXT DEFAULT ’’”], [“prioridade”, “TEXT DEFAULT ‘Moderada’”],
[“data_conclusao”, “TEXT DEFAULT ’’”], [“hora_conclusao”, “TEXT DEFAULT
’’”], [“ultima_atualizacao”, “TEXT DEFAULT ’’”], [“criado_em”, “TEXT
DEFAULT ’’”] ];

for (const [nome, tipo] of cols) { await garantirColuna(env, “chamados”,
nome, tipo); } }

async function garantirTabelaArquivamento(env) { await
env.DB.prepare(CREATE TABLE IF NOT EXISTS chamados_arquivamento (       protocolo TEXT PRIMARY KEY,       arquivado INTEGER NOT NULL DEFAULT 0,       data_ultimo_arquivamento TEXT DEFAULT '',       data_ultima_reabertura TEXT DEFAULT '',       historico_json TEXT DEFAULT '[]'     )).run();
}

async function buscarArquivamento(env, protocolo) { await
garantirTabelaArquivamento(env); return
env.DB.prepare(SELECT * FROM chamados_arquivamento     WHERE protocolo = ? LIMIT 1).bind(protocolo).first();
}

function converterChamado(row, arquivo = null) { if (!row) return null;

let historicoArquivamento = []; try { historicoArquivamento =
arquivo?.historico_json ? JSON.parse(arquivo.historico_json) : []; }
catch {}

return { id: row.id, protocolo: row.protocolo, dataAbertura:
row.data_abertura || ““, horaAbertura: row.hora_abertura ||”“, status:
row.status ||”Aberto”, solicitante: row.solicitante || ““, cargo:
row.cargo ||”“, bloco: row.bloco ||”“, pavimentos: row.pavimentos ||”“,
ocorrencia: row.ocorrencia ||”“, dataOcorrencia: row.data_ocorrencia
||”“, horaInicial: row.hora_inicial ||”“, horaFinal: row.hora_final
||”“, detalhes: row.detalhes ||”“, responsavel: row.responsavel ||”“,
observacaoSolucao: row.observacao_solucao ||”“, dataConclusao:
row.data_conclusao ||”“, horaConclusao: row.hora_conclusao ||”“,
ultimaAtualizacao: row.ultima_atualizacao ||”“, criadoEm: row.criado_em
||”“, prioridade: row.prioridade ||”Moderada”, whatsappRetorno:
row.whatsapp_retorno || ““, respostaAdministracao:
row.resposta_administracao ||”“, arquivado: Number(arquivo?.arquivado ||
0) === 1, dataHoraArquivamento: arquivo?.data_ultimo_arquivamento ||”“,
dataHoraReabertura: arquivo?.data_ultima_reabertura ||”“,
historicoArquivamento }; }

async function buscarChamado(env, protocolo) { await
garantirEstruturaChamados(env); const row = await env.DB.prepare(
SELECT * FROM chamados WHERE protocolo = ? LIMIT 1
).bind(protocolo).first(); return converterChamado(row, await
buscarArquivamento(env, protocolo)); }

async function listarChamados(env) { await
garantirEstruturaChamados(env); await garantirTabelaArquivamento(env);

const resultado = await env.DB.prepare(
SELECT * FROM chamados ORDER BY id DESC ).all();

const arquivos = await env.DB.prepare(
SELECT * FROM chamados_arquivamento ).all();

const mapa = new Map((arquivos.results || []).map(x => [x.protocolo,
x])); const todos = (resultado.results || []).map(x =>
converterChamado(x, mapa.get(x.protocolo)) );

const chamados = todos.filter(x => !x.arquivado); const
chamadosArquivados = todos.filter(x => x.arquivado);

return { chamados, chamadosArquivados, estatisticas: { total:
chamados.length, abertos: chamados.filter(x => x.status ===
“Aberto”).length, andamento: chamados.filter(x => x.status === “Em
andamento”).length, resolvidos: chamados.filter(x => x.status ===
“Resolvido”).length, cancelados: chamados.filter(x => x.status ===
“Cancelado”).length } }; }

async function criarChamado(env, dados) { await
garantirEstruturaChamados(env);

const data = obterDataBrasilia(); const hora = obterHoraBrasilia();
const dataContador = ${data.ano}-${data.mes}-${data.dia};

await
env.DB.prepare(INSERT INTO contadores (data, numero) VALUES (?, 1)     ON CONFLICT(data) DO UPDATE SET numero = numero + 1).bind(dataContador).run();

const contador = await env.DB.prepare(
SELECT numero FROM contadores WHERE data = ? LIMIT 1
).bind(dataContador).first();

const numero = Number(contador?.numero || 0); if (!numero) return
resposta({ sucesso: false, erro: “Não foi possível gerar o número do
protocolo.” }, 503);

const protocolo =
PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-${String(numero).padStart(3, "0")};
const prioridades = [“Urgente”, “Alta”, “Moderada”, “Baixa”]; const
prioridade = prioridades.includes(String(dados.prioridade || ““).trim())
? String(dados.prioridade).trim() :”Moderada”;

const chamado = { protocolo, dataAbertura:
${data.dia}/${data.mes}/${data.ano}, horaAbertura: hora, status:
“Aberto”, solicitante: String(dados.solicitante || ““), cargo:
String(dados.cargo ||”“), bloco: String(dados.bloco ||”“), pavimentos:
String(dados.pavimentos ||”“), ocorrencia: String(dados.ocorrencia ||
dados.tipo_ocorrencia ||”“), dataOcorrencia: primeiroValor(dados,
[”dataOcorrencia”,”data_ocorrencia”,”dataOcorrido”,”data_ocorrido”,”dataFato”,”data_fato”]),
horaInicial: primeiroValor(dados,
[”horaInicial”,”hora_inicial”,”inicio”,”horaInicio”,”hora_inicio”]),
horaFinal: primeiroValor(dados,
[”horaFinal”,”hora_final”,”fim”,”horaFim”,”hora_fim”]), detalhes:
String(dados.detalhes ||”“), prioridade, whatsappRetorno:
String(dados.whatsappRetorno || dados.whatsapp_retorno ||”“).trim(),
criadoEm: new Date().toISOString() };

await
env.DB.prepare(INSERT INTO chamados (       protocolo,data_abertura,hora_abertura,status,solicitante,cargo,bloco,       pavimentos,ocorrencia,data_ocorrencia,hora_inicial,hora_final,detalhes,       responsavel,observacao_solucao,prioridade,whatsapp_retorno,       resposta_administracao,criado_em     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)).bind(
chamado.protocolo, chamado.dataAbertura, chamado.horaAbertura,
chamado.status, chamado.solicitante, chamado.cargo, chamado.bloco,
chamado.pavimentos, chamado.ocorrencia, chamado.dataOcorrencia,
chamado.horaInicial, chamado.horaFinal, chamado.detalhes, ““,”“,
chamado.prioridade, chamado.whatsappRetorno,”“, chamado.criadoEm
).run();

return resposta({ sucesso: true, mensagem: “Chamado registrado com
sucesso.”, protocolo, chamado }); }

async function atualizarChamado(env, dados) { if (!dados.protocolo)
return resposta({ sucesso:false, erro:“Informe o protocolo.” }, 400);

const protocolo = String(dados.protocolo).trim().toUpperCase(); const
atual = await buscarChamado(env, protocolo); if (!atual) return
resposta({ sucesso:false, erro:“Protocolo não encontrado.” }, 404);

const permitidos = [“Aberto”,“Em andamento”,“Resolvido”,“Cancelado”];
const status = dados.status || atual.status || “Aberto”; if
(!permitidos.includes(status)) { return resposta({ sucesso:false,
erro:“Status inválido.” }, 400); }

const d = obterDataBrasilia(); const h = obterHoraBrasilia(); const
concluido = status === “Resolvido”;

const prioridade =
[“Urgente”,“Alta”,“Moderada”,“Baixa”].includes(String(dados.prioridade
|| atual.prioridade || “Moderada”)) ? String(dados.prioridade ||
atual.prioridade || “Moderada”) : “Moderada”;

const observacao = Object.prototype.hasOwnProperty.call(dados,
“observacaoSolucao”) ? String(dados.observacaoSolucao || ““).trim() :
atual.observacaoSolucao;

await
env.DB.prepare(UPDATE chamados SET status=?, responsavel=?, observacao_solucao=?,     data_conclusao=?, hora_conclusao=?, ultima_atualizacao=?,     prioridade=?, resposta_administracao=? WHERE protocolo=?).bind(
status, dados.responsavel !== undefined ? String(dados.responsavel ||
““) : atual.responsavel, observacao, concluido ?
${d.dia}/${d.mes}/${d.ano} :”“, concluido ? h :”“,
${d.dia}/${d.mes}/${d.ano} ${h}, prioridade, observacao, protocolo
).run();

return resposta({ sucesso: true, mensagem: “Chamado atualizado com
sucesso.”, chamado: await buscarChamado(env, protocolo) }); }

async function arquivarChamado(env, dados) { const protocolo =
String(dados.protocolo || ““).trim().toUpperCase(); const chamado =
await buscarChamado(env, protocolo); if (!chamado) return resposta({
sucesso:false, erro:”Protocolo não encontrado.” }, 404); if
(chamado.status !== “Resolvido”) { return resposta({ sucesso:false,
erro:“Somente chamados resolvidos podem ser arquivados.” }, 400); }

const agora = dataHoraBrasilia(); const historico =
[…(chamado.historicoArquivamento || []), { tipo:“ARQUIVADO”,
dataHora:agora }];

await
env.DB.prepare(INSERT INTO chamados_arquivamento     (protocolo,arquivado,data_ultimo_arquivamento,historico_json)     VALUES (?,1,?,?)     ON CONFLICT(protocolo) DO UPDATE SET     arquivado=1,data_ultimo_arquivamento=excluded.data_ultimo_arquivamento,     historico_json=excluded.historico_json).bind(protocolo,
agora, JSON.stringify(historico)).run();

return resposta({ sucesso:true, mensagem:“Chamado arquivado com
sucesso.”, chamado:await buscarChamado(env, protocolo) }); }

async function reabrirChamado(env, dados) { const protocolo =
String(dados.protocolo || ““).trim().toUpperCase(); const chamado =
await buscarChamado(env, protocolo); if (!chamado) return resposta({
sucesso:false, erro:”Protocolo não encontrado.” }, 404);

const agora = dataHoraBrasilia(); const historico =
[…(chamado.historicoArquivamento || []), { tipo:“REABERTO”,
dataHora:agora }];

await
env.DB.prepare(INSERT INTO chamados_arquivamento     (protocolo,arquivado,data_ultima_reabertura,historico_json)     VALUES (?,0,?,?)     ON CONFLICT(protocolo) DO UPDATE SET     arquivado=0,data_ultima_reabertura=excluded.data_ultima_reabertura,     historico_json=excluded.historico_json).bind(protocolo,
agora, JSON.stringify(historico)).run();

return resposta({ sucesso:true, mensagem:“Chamado reaberto com
sucesso.”, chamado:await buscarChamado(env, protocolo) }); }

async function excluirChamado(env, dados) { const protocolo =
String(dados.protocolo || ““).trim().toUpperCase(); const chamado =
await buscarChamado(env, protocolo); if (!chamado) return resposta({
sucesso:false, erro:”Protocolo não encontrado.” }, 404);

await garantirTabelaArquivamento(env); await
env.DB.prepare(DELETE FROM chamados WHERE protocolo=?).bind(protocolo).run();
await
env.DB.prepare(DELETE FROM chamados_arquivamento WHERE protocolo=?).bind(protocolo).run();

return resposta({ sucesso:true, mensagem:“Chamado excluído com
sucesso.”, protocolo }); }

async function login(env, dados) { const auth = verificarSenha(dados,
env); if (!auth.ok) return auth.resposta; return resposta({
sucesso:true, mensagem:“Acesso administrativo autorizado.” }); }

async function consultarProtocolo(env, protocolo) { if (!protocolo) {
return resposta({ encontrado:false, erro:“Informe o número do
protocolo.” }, 400); }

const chamado = await buscarChamado(env,
String(protocolo).trim().toUpperCase()); if (!chamado) { return
resposta({ encontrado:false, erro:“Protocolo não encontrado.” }, 404); }

return resposta({ encontrado:true, chamado }); }

/* ADMINISTRATIVO */

function obterDBAdministrativo(env) { if (!env?.DB || typeof
env.DB.prepare !== “function”) { throw new Error(“Binding D1 ‘DB’ não
encontrado ou inválido.”); } return env.DB; }

async function garantirTabelasAdministrativas(env) { const db =
obterDBAdministrativo(env);

await
db.prepare(CREATE TABLE IF NOT EXISTS contadores_administrativos (       ano INTEGER PRIMARY KEY, numero INTEGER NOT NULL DEFAULT 0     )).run();

await
db.prepare(CREATE TABLE IF NOT EXISTS advertencias_notificacoes (       id INTEGER PRIMARY KEY AUTOINCREMENT,       protocolo TEXT NOT NULL UNIQUE,       tipo TEXT NOT NULL,       data_registro TEXT NOT NULL,       data_ocorrencia TEXT DEFAULT '',       bloco TEXT NOT NULL,       unidade TEXT NOT NULL,       infracao TEXT NOT NULL,       descricao TEXT DEFAULT '',       base_regimento TEXT DEFAULT '',       responsavel TEXT DEFAULT '',       observacoes TEXT DEFAULT '',       protocolo_chamado TEXT DEFAULT '',       status TEXT NOT NULL DEFAULT 'Registrada',       criado_em TEXT NOT NULL,       atualizado_em TEXT NOT NULL     )).run();
}

function converterMedidaAdministrativa(r) { if (!r) return null; return
{ id:r.id, protocolo:r.protocolo, tipo:r.tipo,
dataRegistro:r.data_registro || ““, dataOcorrencia:r.data_ocorrencia
||”“, bloco:r.bloco ||”“, unidade:r.unidade ||”“, infracao:r.infracao
||”“, descricao:r.descricao ||”“, baseRegimento:r.base_regimento ||”“,
responsavel:r.responsavel ||”“, observacoes:r.observacoes ||”“,
protocoloChamado:r.protocolo_chamado ||”“, status:r.status
||”Registrada”, criadoEm:r.criado_em || ““, atualizadoEm:r.atualizado_em
||”” }; }

async function listarMedidasAdministrativas(env) { const db =
obterDBAdministrativo(env); await garantirTabelasAdministrativas(env);
const r = await
db.prepare(SELECT * FROM advertencias_notificacoes ORDER BY id DESC).all();
return (r.results ||
[]).map(converterMedidaAdministrativa).filter(Boolean); }

async function criarMedidaAdministrativa(env, dados) { const db =
obterDBAdministrativo(env); await garantirTabelasAdministrativas(env);

const tipo = String(dados.tipo || ““).trim(); if
(![”Advertência”,”Notificação”].includes(tipo)) { return resposta({
sucesso:false, erro:”Tipo administrativo inválido.” }, 400); }

const bloco = String(dados.bloco || ““).trim(); const unidade =
String(dados.unidade ||”“).trim(); const infracao =
String(dados.infracao ||”“).trim();

if (!bloco || !unidade || !infracao) { return resposta({ sucesso:false,
erro:“Informe bloco, unidade e infração.” }, 400); }

const d = obterDataBrasilia(); const ano = Number(d.ano);

await
db.prepare(INSERT INTO contadores_administrativos (ano,numero) VALUES (?,1)     ON CONFLICT(ano) DO UPDATE SET numero=numero+1).bind(ano).run();

const c = await db.prepare(
SELECT numero FROM contadores_administrativos WHERE ano=? LIMIT 1
).bind(ano).first();

const protocolo =
ADM-${ano}-${String(Number(c?.numero || 0)).padStart(4,"0")}; const
agora = ${d.dia}/${d.mes}/${d.ano} ${obterHoraBrasilia()};

const medida = { protocolo, tipo, dataRegistro:dados.dataRegistro ||
${d.dia}/${d.mes}/${d.ano}, dataOcorrencia:dados.dataOcorrencia ||
dados.data_ocorrencia || ““, bloco, unidade, infracao,
descricao:String(dados.descricao ||”“),
baseRegimento:String(dados.baseRegimento ||”“),
responsavel:String(dados.responsavel ||”“),
observacoes:String(dados.observacoes ||”“),
protocoloChamado:String(dados.protocoloChamado ||”“),
status:String(dados.status ||”Registrada”), criadoEm:agora,
atualizadoEm:agora };

await
db.prepare(INSERT INTO advertencias_notificacoes (       protocolo,tipo,data_registro,data_ocorrencia,bloco,unidade,infracao,       descricao,base_regimento,responsavel,observacoes,protocolo_chamado,       status,criado_em,atualizado_em     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)).bind(
medida.protocolo,medida.tipo,medida.dataRegistro,medida.dataOcorrencia,
medida.bloco,medida.unidade,medida.infracao,medida.descricao,
medida.baseRegimento,medida.responsavel,medida.observacoes,
medida.protocoloChamado,medida.status,medida.criadoEm,medida.atualizadoEm
).run();

return resposta({ sucesso:true, mensagem:“Registro administrativo criado
com sucesso.”, medida }); }

async function excluirMedidaAdministrativa(env, dados) { const db =
obterDBAdministrativo(env); await garantirTabelasAdministrativas(env);

const protocolo = String(dados.protocolo || ““).trim().toUpperCase(); if
(!protocolo) { return resposta({ sucesso:false, erro:”Informe o
protocolo administrativo.” }, 400); }

const existe = await db.prepare(
SELECT id FROM advertencias_notificacoes WHERE protocolo=? LIMIT 1
).bind(protocolo).first();

if (!existe) { return resposta({ sucesso:false, erro:“Registro
administrativo não encontrado.” }, 404); }

await db.prepare(
DELETE FROM advertencias_notificacoes WHERE protocolo=?
).bind(protocolo).run();

return resposta({ sucesso:true, mensagem:“Registro administrativo
excluído com sucesso.”, protocolo }); }

async function servirIndex(request, env) { if (!env.ASSETS || typeof
env.ASSETS.fetch !== “function”) { return resposta({ sucesso:false,
erro:“Assets do site não estão configurados neste Worker. Verifique o
binding ASSETS.” }, 500); }

return env.ASSETS.fetch( new Request(new URL(“/index.html”,
request.url), request) ); }

export default { async fetch(request, env) { if (request.method ===
“OPTIONS”) return resposta({ sucesso:true });

    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const ehAPI = pathname === "/api/protocolo" ||
                    pathname === "/.netlify/functions/protocolo";

      if (request.method === "GET" && ehAPI) {
        return consultarProtocolo(env, url.searchParams.get("protocolo"));
      }

      if (request.method === "GET" && pathname === "/" && url.searchParams.has("protocolo")) {
        return consultarProtocolo(env, url.searchParams.get("protocolo"));
      }

      if (request.method === "GET" && pathname === "/") {
        return servirIndex(request, env);
      }

      if (request.method === "GET") {
        if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
          return env.ASSETS.fetch(request);
        }
        return resposta({ sucesso:false, erro:"Recurso não encontrado." }, 404);
      }

      if (request.method !== "POST") {
        return resposta({ sucesso:false, erro:"Método não permitido." }, 405);
      }

      let dados;
      try {
        dados = await request.json();
      } catch {
        return resposta({ sucesso:false, erro:"Dados inválidos." }, 400);
      }

      if (dados.action === "login") return login(env, dados);

      if (dados.action === "list") {
        const a = verificarSenha(dados, env);
        if (!a.ok) return a.resposta;
        const r = await listarChamados(env);
        return resposta({ sucesso:true, chamados:r.chamados, chamadosArquivados:r.chamadosArquivados, estatisticas:r.estatisticas });
      }

      if (dados.action === "listAdministrative") {
        const a = verificarSenha(dados, env);
        if (!a.ok) return a.resposta;
        return resposta({ sucesso:true, medidas:await listarMedidasAdministrativas(env) });
      }

      if (dados.action === "createAdministrative") {
        const a = verificarSenha(dados, env);
        if (!a.ok) return a.resposta;
        return criarMedidaAdministrativa(env, dados);
      }

      if (dados.action === "deleteAdministrative") {
        const a = verificarSenha(dados, env);
        if (!a.ok) return a.resposta;
        return excluirMedidaAdministrativa(env, dados);
      }

      if (dados.action === "update") {
        const a = verificarSenha(dados, env);
        if (!a.ok) return a.resposta;
        return atualizarChamado(env, dados);
      }

      if (dados.action === "archive") {
        const a = verificarSenha(dados, env);
        if (!a.ok) return a.resposta;
        return arquivarChamado(env, dados);
      }

      if (dados.action === "reopen") {
        const a = verificarSenha(dados, env);
        if (!a.ok) return a.resposta;
        return reabrirChamado(env, dados);
      }

      if (dados.action === "delete") {
        const a = verificarSenha(dados, env);
        if (!a.ok) return a.resposta;
        return excluirChamado(env, dados);
      }

      return criarChamado(env, dados);

    } catch (erro) {
      console.error("ERRO NO WORKER:", erro);
      return resposta({
        sucesso:false,
        erro:"Erro interno no sistema.",
        detalhe:erro?.message || String(erro)
      }, 500);
    }

} };
