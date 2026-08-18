/*

PARQUE CLUBE - CLOUDFLARE WORKER Sistema de Chamados / Ordem de Serviço

D1: Binding: DB

Secret: ADMIN_PASSWORD

API OFICIAL: /api/protocolo

A API oficial utiliza somente: /api/protocolo
============================================================ */

/* ========================================================= RESPOSTA
JSON ========================================================= */

function resposta(dados, status = 200) {

    return new Response(
        JSON.stringify(dados),
        {
            status,

            headers: {
                "Content-Type":
                    "application/json; charset=UTF-8",

                "Access-Control-Allow-Origin":
                    "*",

                "Access-Control-Allow-Methods":
                    "GET, POST, OPTIONS",

                "Access-Control-Allow-Headers":
                    "Content-Type"
            }
        }
    );

}

/* ========================================================= DATA DE
BRASÍLIA ========================================================= */

function obterDataBrasilia() {

    const partes =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    "America/Sao_Paulo",

                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).formatToParts(
            new Date()
        );

    return {

        ano:
            partes.find(
                p =>
                    p.type === "year"
            ).value,

        mes:
            partes.find(
                p =>
                    p.type === "month"
            ).value,

        dia:
            partes.find(
                p =>
                    p.type === "day"
            ).value
    };

}

/* ========================================================= HORA DE
BRASÍLIA ========================================================= */

function obterHoraBrasilia() {

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            timeZone:
                "America/Sao_Paulo",

            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",

            hour12: false
        }
    ).format(
        new Date()
    );

}

/* =========================================================
AUTENTICAÇÃO ADMINISTRATIVA
========================================================= */

function verificarSenha( dados, env ) {

    const senhaAdmin =
        String(
            env.ADMIN_PASSWORD || ""
        ).trim();


    const senhaInformada =
        String(
            dados.adminPassword || ""
        ).trim();


    if (!senhaAdmin) {

        return {

            ok: false,

            resposta:
                resposta(
                    {
                        sucesso:
                            false,

                        erro:
                            "A senha administrativa não está configurada no Cloudflare."
                    },

                    500
                )
        };
    }


    if (
        !senhaInformada ||
        senhaInformada !==
            senhaAdmin
    ) {

        return {

            ok: false,

            resposta:
                resposta(
                    {
                        sucesso:
                            false,

                        erro:
                            "Senha administrativa incorreta."
                    },

                    401
                )
        };
    }


    return {
        ok: true
    };

}

/* ========================================================= CONVERTER
CHAMADO ========================================================= */

function converterChamado(row, arquivo = null) {

    if (!row) {
        return null;
    }

    const historicoArquivamento =
        arquivo && arquivo.historico_json
            ? JSON.parse(arquivo.historico_json)
            : [];

    return {

        id:
            row.id,

        protocolo:
            row.protocolo,

        dataAbertura:
            row.data_abertura || "",

        horaAbertura:
            row.hora_abertura || "",

        status:
            row.status || "Aberto",

        solicitante:
            row.solicitante || "",

        cargo:
            row.cargo || "",

        bloco:
            row.bloco || "",

        pavimentos:
            row.pavimentos || "",

        ocorrencia:
            row.ocorrencia ||
            row.tipo_ocorrencia ||
            "",

        dataOcorrencia:
            row.data_ocorrencia || "",

        horaInicial:
            row.hora_inicial || "",

        horaFinal:
            row.hora_final || "",

        detalhes:
            row.detalhes || "",

        responsavel:
            row.responsavel || "",

        observacaoSolucao:
            row.observacao_solucao || "",

        dataConclusao:
            row.data_conclusao || "",

        horaConclusao:
            row.hora_conclusao || "",

        ultimaAtualizacao:
            row.ultima_atualizacao || "",

        criadoEm:
            row.criado_em || "",

        prioridade:
            row.prioridade ||
            "Moderada",

        arquivado:
            arquivo
                ? Number(arquivo.arquivado || 0) === 1
                : false,

        dataHoraArquivamento:
            arquivo?.data_ultimo_arquivamento || "",

        dataHoraReabertura:
            arquivo?.data_ultima_reabertura || "",

        historicoArquivamento
    };

}

/* ========================================================= TABELA
AUXILIAR DE ARQUIVAMENTO Não altera a tabela existente “chamados”.
========================================================= */

async function garantirTabelaArquivamento(env) {

    await env.DB
        .prepare(
            `
            CREATE TABLE IF NOT EXISTS chamados_arquivamento (

                protocolo TEXT PRIMARY KEY,

                arquivado INTEGER NOT NULL DEFAULT 0,

                data_ultimo_arquivamento TEXT DEFAULT '',

                data_ultima_reabertura TEXT DEFAULT '',

                historico_json TEXT DEFAULT '[]'
            )
            `
        )
        .run();

}

/* ========================================================= BUSCAR
REGISTRO DE ARQUIVAMENTO
========================================================= */

async function buscarArquivamento( env, protocolo ) {

    await garantirTabelaArquivamento(env);

    return env.DB
        .prepare(
            `
            SELECT *
            FROM chamados_arquivamento
            WHERE protocolo = ?
            LIMIT 1
            `
        )
        .bind(protocolo)
        .first();

}

/* ========================================================= BUSCAR
CHAMADO ========================================================= */

async function buscarChamado( env, protocolo ) {

    const resultado =
        await env.DB
            .prepare(
                `
                SELECT *
                FROM chamados
                WHERE protocolo = ?
                LIMIT 1
                `
            )
            .bind(
                protocolo
            )
            .first();


    const arquivo =
        await buscarArquivamento(
            env,
            protocolo
        );

    return converterChamado(
        resultado,
        arquivo
    );

}

/* ========================================================= LISTAR
TODOS ========================================================= */

async function listarChamados( env ) {

    await garantirTabelaArquivamento(env);

    const resultado =
        await env.DB
            .prepare(
                `
                SELECT *
                FROM chamados
                ORDER BY id DESC
                `
            )
            .all();

    const arquivos =
        await env.DB
            .prepare(
                `
                SELECT *
                FROM chamados_arquivamento
                `
            )
            .all();

    const mapaArquivos =
        new Map(
            (arquivos.results || []).map(
                item => [
                    item.protocolo,
                    item
                ]
            )
        );

    const chamados =
        (
            resultado.results ||
            []
        )
        .map(
            row =>
                converterChamado(
                    row,
                    mapaArquivos.get(
                        row.protocolo
                    ) || null
                )
        )
        .filter(Boolean);

    const chamadosArquivados =
        chamados.filter(
            c =>
                c.arquivado === true
        );

    const chamadosAtivos =
        chamados.filter(
            c =>
                c.arquivado !== true
        );

    const estatisticas = {

        total:
            chamadosAtivos.length,

        abertos:
            chamadosAtivos.filter(
                c =>
                    c.status ===
                    "Aberto"
            ).length,

        andamento:
            chamadosAtivos.filter(
                c =>
                    c.status ===
                    "Em andamento"
            ).length,

        resolvidos:
            chamadosAtivos.filter(
                c =>
                    c.status ===
                    "Resolvido"
            ).length,

        cancelados:
            chamadosAtivos.filter(
                c =>
                    c.status ===
                    "Cancelado"
            ).length,

        arquivados:
            chamadosArquivados.length
    };

    return {

        chamados:
            chamadosAtivos,

        chamadosArquivados,

        estatisticas
    };

}

/* ========================================================= CRIAR
CHAMADO ========================================================= */

async function criarChamado( env, dados ) {

    const data =
        obterDataBrasilia();


    const hora =
        obterHoraBrasilia();


    const dataContador =
        `${data.ano}-${data.mes}-${data.dia}`;


    /*
     * CONTADOR DIÁRIO
     */

    const contador =
        await env.DB
            .prepare(
                `
                INSERT INTO contadores
                    (data, numero)

                VALUES
                    (?, 1)

                ON CONFLICT(data)
                DO UPDATE SET
                    numero =
                        numero + 1

                RETURNING numero
                `
            )
            .bind(
                dataContador
            )
            .first();


    if (!contador) {

        return resposta(
            {
                sucesso:
                    false,

                erro:
                    "Não foi possível gerar o número do protocolo."
            },

            503
        );
    }


    const numero =
        Number(
            contador.numero
        );


    const sequencial =
        String(numero)
            .padStart(
                3,
                "0"
            );


    const protocolo =
        `PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-${sequencial}`;


    /*
     * PRIORIDADE
     *
     * Moderada é o padrão.
     * A prioridade é independente
     * do tipo de ocorrência.
     */

    const prioridadesPermitidas = [

        "Urgente",
        "Alta",
        "Moderada",
        "Baixa"

    ];


    const prioridadeInformada =
        String(
            dados.prioridade ||
            "Moderada"
        ).trim();


    const prioridade =
        prioridadesPermitidas.includes(
            prioridadeInformada
        )
            ? prioridadeInformada
            : "Moderada";


    const chamado = {

        protocolo,

        dataAbertura:
            `${data.dia}/${data.mes}/${data.ano}`,

        horaAbertura:
            hora,

        status:
            "Aberto",

        solicitante:
            dados.solicitante ||
            "",

        cargo:
            dados.cargo ||
            "",

        bloco:
            dados.bloco ||
            "",

        pavimentos:
            dados.pavimentos ||
            "",

        ocorrencia:
            dados.ocorrencia ||
            dados.tipo_ocorrencia ||
            "",

        dataOcorrencia:
            dados.dataOcorrencia ||
            "",

        horaInicial:
            dados.horaInicial ||
            "",

        horaFinal:
            dados.horaFinal ||
            "",

        detalhes:
            dados.detalhes ||
            "",

        responsavel:
            "",

        observacaoSolucao:
            "",

        prioridade,

        criadoEm:
            new Date().toISOString()
    };


    /*
     * GRAVAÇÃO NO D1
     */

    await env.DB
        .prepare(
            `
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
                criado_em

            )

            VALUES (

                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?

            )
            `
        )
        .bind(

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

            chamado.criadoEm

        )
        .run();


    return resposta({

        sucesso:
            true,

        protocolo:
            protocolo,

        chamado:
            chamado
    });

}

/* ========================================================= ATUALIZAR
CHAMADO ========================================================= */

async function atualizarChamado( env, dados ) {

    if (!dados.protocolo) {

        return resposta(
            {
                sucesso:
                    false,

                erro:
                    "Informe o protocolo."
            },

            400
        );
    }


    const protocolo =
        String(
            dados.protocolo
        )
        .trim()
        .toUpperCase();


    const chamadoAtual =
        await buscarChamado(
            env,
            protocolo
        );


    if (!chamadoAtual) {

        return resposta(
            {
                sucesso:
                    false,

                erro:
                    "Protocolo não encontrado."
            },

            404
        );
    }


    const statusPermitidos = [

        "Aberto",

        "Em andamento",

        "Resolvido",

        "Cancelado"

    ];


    if (
        !statusPermitidos.includes(
            dados.status
        )
    ) {

        return resposta(
            {
                sucesso:
                    false,

                erro:
                    "Status inválido."
            },

            400
        );
    }


    const prioridadesPermitidas = [

        "Urgente",

        "Alta",

        "Moderada",

        "Baixa"

    ];


    const prioridade =
        prioridadesPermitidas.includes(
            String(
                dados.prioridade ||
                ""
            ).trim()
        )

            ? String(
                dados.prioridade
            ).trim()

            : (
                chamadoAtual.prioridade ||
                "Moderada"
            );


    const data =
        obterDataBrasilia();


    const hora =
        obterHoraBrasilia();


    let dataConclusao =
        chamadoAtual.dataConclusao ||
        "";


    let horaConclusao =
        chamadoAtual.horaConclusao ||
        "";


    if (
        dados.status ===
        "Resolvido"
    ) {

        dataConclusao =
            `${data.dia}/${data.mes}/${data.ano}`;

        horaConclusao =
            hora;

    } else {

        dataConclusao =
            "";

        horaConclusao =
            "";
    }


    const ultimaAtualizacao =
        `${data.dia}/${data.mes}/${data.ano} ${hora}`;


    await env.DB
        .prepare(
            `
            UPDATE chamados

            SET

                status = ?,

                responsavel = ?,

                observacao_solucao = ?,

                prioridade = ?,

                data_conclusao = ?,

                hora_conclusao = ?,

                ultima_atualizacao = ?

            WHERE protocolo = ?
            `
        )
        .bind(

            dados.status,

            dados.responsavel ||
                "",

            dados.observacaoSolucao ||
                "",

            prioridade,

            dataConclusao,

            horaConclusao,

            ultimaAtualizacao,

            protocolo

        )
        .run();


    const atualizado =
        await buscarChamado(
            env,
            protocolo
        );


    return resposta({

        sucesso:
            true,

        mensagem:
            "Chamado atualizado com sucesso.",

        chamado:
            atualizado
    });

}

/* ========================================================= ARQUIVAR
CHAMADO ========================================================= */

async function arquivarChamado( env, dados ) {

    if (!dados.protocolo) {
        return resposta({
            sucesso: false,
            erro: "Informe o protocolo."
        }, 400);
    }

    const protocolo =
        String(dados.protocolo)
            .trim()
            .toUpperCase();

    const chamado =
        await buscarChamado(
            env,
            protocolo
        );

    if (!chamado) {
        return resposta({
            sucesso: false,
            erro: "Protocolo não encontrado."
        }, 404);
    }

    await garantirTabelaArquivamento(env);

    const data =
        obterDataBrasilia();

    const hora =
        obterHoraBrasilia();

    const agora =
        `${data.dia}/${data.mes}/${data.ano} ${hora}`;

    const registro =
        await buscarArquivamento(
            env,
            protocolo
        );

    let historico = [];

    if (
        registro &&
        registro.historico_json
    ) {
        try {
            historico =
                JSON.parse(
                    registro.historico_json
                );
        } catch {
            historico = [];
        }
    }

    if (
        !Array.isArray(historico)
    ) {
        historico = [];
    }

    historico.push({
        tipo: "ARQUIVADO",
        dataHora: agora
    });

    await env.DB
        .prepare(
            `
            INSERT INTO chamados_arquivamento (
                protocolo,
                arquivado,
                data_ultimo_arquivamento,
                data_ultima_reabertura,
                historico_json
            )
            VALUES (?, 1, ?, ?, ?)
            ON CONFLICT(protocolo)
            DO UPDATE SET
                arquivado = 1,
                data_ultimo_arquivamento = excluded.data_ultimo_arquivamento,
                historico_json = excluded.historico_json
            `
        )
        .bind(
            protocolo,
            agora,
            registro?.data_ultima_reabertura || "",
            JSON.stringify(historico)
        )
        .run();

    const atualizado =
        await buscarChamado(
            env,
            protocolo
        );

    return resposta({
        sucesso: true,
        mensagem:
            "Chamado arquivado com sucesso.",
        chamado: atualizado
    });

}

/* ========================================================= REABRIR
CHAMADO ========================================================= */

async function reabrirChamado( env, dados ) {

    if (!dados.protocolo) {
        return resposta({
            sucesso: false,
            erro: "Informe o protocolo."
        }, 400);
    }

    const protocolo =
        String(dados.protocolo)
            .trim()
            .toUpperCase();

    const chamado =
        await buscarChamado(
            env,
            protocolo
        );

    if (!chamado) {
        return resposta({
            sucesso: false,
            erro: "Protocolo não encontrado."
        }, 404);
    }

    await garantirTabelaArquivamento(env);

    const registro =
        await buscarArquivamento(
            env,
            protocolo
        );

    if (
        !registro ||
        Number(registro.arquivado || 0) !== 1
    ) {
        return resposta({
            sucesso: true,
            mensagem:
                "O chamado já está ativo.",
            chamado
        });
    }

    const data =
        obterDataBrasilia();

    const hora =
        obterHoraBrasilia();

    const agora =
        `${data.dia}/${data.mes}/${data.ano} ${hora}`;

    let historico = [];

    try {
        historico =
            JSON.parse(
                registro.historico_json || "[]"
            );
    } catch {
        historico = [];
    }

    if (
        !Array.isArray(historico)
    ) {
        historico = [];
    }

    historico.push({
        tipo: "REABERTO",
        dataHora: agora
    });

    await env.DB
        .prepare(
            `
            UPDATE chamados_arquivamento

            SET
                arquivado = 0,
                data_ultima_reabertura = ?,
                historico_json = ?

            WHERE protocolo = ?
            `
        )
        .bind(
            agora,
            JSON.stringify(historico),
            protocolo
        )
        .run();

    const atualizado =
        await buscarChamado(
            env,
            protocolo
        );

    return resposta({
        sucesso: true,
        mensagem:
            "Chamado reaberto com sucesso.",
        chamado: atualizado
    });

}

/* ========================================================= EXCLUIR
CHAMADO ========================================================= */

async function excluirChamado( env, dados ) {

    if (!dados.protocolo) {

        return resposta(
            {
                sucesso:
                    false,

                erro:
                    "Informe o protocolo."
            },

            400
        );
    }


    const protocolo =
        String(
            dados.protocolo
        )
        .trim()
        .toUpperCase();


    const chamado =
        await buscarChamado(
            env,
            protocolo
        );


    if (!chamado) {

        return resposta(
            {
                sucesso:
                    false,

                erro:
                    "Protocolo não encontrado."
            },

            404
        );
    }


    await garantirTabelaArquivamento(env);

    await env.DB
        .prepare(
            `
            DELETE FROM chamados
            WHERE protocolo = ?
            `
        )
        .bind(
            protocolo
        )
        .run();

    await env.DB
        .prepare(
            `
            DELETE FROM chamados_arquivamento
            WHERE protocolo = ?
            `
        )
        .bind(
            protocolo
        )
        .run();


    return resposta({

        sucesso:
            true,

        mensagem:
            "Chamado excluído com sucesso.",

        protocolo:
            protocolo
    });

}


/* =========================================================
   ADVERTÊNCIAS / NOTIFICAÇÕES — MÓDULO ADMINISTRATIVO
   MIGRADO DA V4.4 TESTE PARA A MAIN OFICIAL
   Protocolo: ADM-AAAA-0001
========================================================= */

function obterDBAdministrativo(env) {
    if (!env || !env.DB) {
        throw new Error(
            "Binding D1 'DB' não encontrado neste Worker."
        );
    }

    if (typeof env.DB.prepare !== "function") {
        throw new Error(
            "O binding 'DB' não é um banco D1 válido."
        );
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

    return true;
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
        SELECT
            id,
            protocolo,
            tipo,
            data_registro,
            data_ocorrencia,
            bloco,
            unidade,
            infracao,
            descricao,
            base_regimento,
            responsavel,
            observacoes,
            protocolo_chamado,
            status,
            criado_em,
            atualizado_em
        FROM advertencias_notificacoes
        ORDER BY id DESC
    `).all();

    const registros =
        Array.isArray(resultado?.results)
            ? resultado.results
            : [];

    return registros
        .map(converterMedidaAdministrativa)
        .filter(Boolean);
}

async function gerarProtocoloAdministrativo(env) {

    const db = obterDBAdministrativo(env);
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
        throw new Error(
            "Não foi possível gerar o protocolo administrativo."
        );
    }

    return `ADM-${ano}-${String(numero).padStart(4, "0")}`;
}

async function criarMedidaAdministrativa(env, dados) {

    const db = obterDBAdministrativo(env);

    await garantirTabelasAdministrativas(env);

    const tiposPermitidos = [
        "Advertência",
        "Notificação"
    ];

    const blocosPermitidos = [
        "1A","1B","1C","1D","1E",
        "2A","2B","2C","2D","2E"
    ];

    const tipo =
        String(dados.tipo || "").trim();

    const bloco =
        String(dados.bloco || "")
            .trim()
            .toUpperCase()
            .replace(/^BLOCO\s+/, "");

    const unidade =
        String(dados.unidade || "").trim();

    const infracao =
        String(dados.infracao || "").trim();

    const protocoloChamado =
        String(dados.protocoloChamado || "")
            .trim()
            .toUpperCase();

    if (!tiposPermitidos.includes(tipo)) {
        return resposta({
            sucesso: false,
            erro: "Selecione Advertência ou Notificação."
        }, 400);
    }

    if (!blocosPermitidos.includes(bloco)) {
        return resposta({
            sucesso: false,
            erro: "Selecione um dos 10 blocos oficiais."
        }, 400);
    }

    if (!unidade) {
        return resposta({
            sucesso: false,
            erro: "Informe a unidade."
        }, 400);
    }

    if (!infracao) {
        return resposta({
            sucesso: false,
            erro: "Informe a infração/ocorrência."
        }, 400);
    }

    let chamado = null;

    if (protocoloChamado) {
        chamado = await buscarChamado(env, protocoloChamado);

        if (!chamado) {
            return resposta({
                sucesso: false,
                erro:
                    "O protocolo do chamado informado não foi encontrado."
            }, 404);
        }
    }

    const data = obterDataBrasilia();

    const hoje =
        `${data.ano}-${data.mes}-${data.dia}`;

    const agora =
        `${hoje} ${obterHoraBrasilia()}`;

    const protocolo =
        await gerarProtocoloAdministrativo(env);

    await db.prepare(`
        INSERT INTO advertencias_notificacoes (
            protocolo,
            tipo,
            data_registro,
            data_ocorrencia,
            bloco,
            unidade,
            infracao,
            descricao,
            base_regimento,
            responsavel,
            observacoes,
            protocolo_chamado,
            status,
            criado_em,
            atualizado_em
        )
        VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, 'Registrada', ?, ?
        )
    `).bind(
        protocolo,
        tipo,
        String(dados.dataRegistro || hoje),
        String(dados.dataOcorrencia || hoje),
        bloco,
        unidade,
        infracao,
        String(dados.descricao || "").trim(),
        String(dados.baseRegimento || "").trim(),
        String(dados.responsavel || "").trim(),
        String(dados.observacoes || "").trim(),
        protocoloChamado,
        agora,
        agora
    ).run();

    const registro = await db.prepare(`
        SELECT *
        FROM advertencias_notificacoes
        WHERE protocolo = ?
        LIMIT 1
    `).bind(protocolo).first();

    return resposta({
        sucesso: true,
        medida:
            converterMedidaAdministrativa(registro),
        chamadoRelacionado:
            chamado
    });
}

async function excluirMedidaAdministrativa(env, dados) {

    const db = obterDBAdministrativo(env);

    await garantirTabelasAdministrativas(env);

    const protocolo =
        String(dados.protocolo || "")
            .trim()
            .toUpperCase();

    if (!protocolo) {
        return resposta({
            sucesso: false,
            erro:
                "Informe o protocolo administrativo."
        }, 400);
    }

    const existente = await db.prepare(`
        SELECT id
        FROM advertencias_notificacoes
        WHERE protocolo = ?
        LIMIT 1
    `).bind(protocolo).first();

    if (!existente) {
        return resposta({
            sucesso: false,
            erro:
                "Protocolo administrativo não encontrado."
        }, 404);
    }

    await db.prepare(`
        DELETE FROM advertencias_notificacoes
        WHERE protocolo = ?
    `).bind(protocolo).run();

    return resposta({
        sucesso: true,
        protocolo,
        mensagem:
            "Registro administrativo excluído."
    });
}


/* ========================================================= LOGIN
========================================================= */

async function login( env, dados ) {

    const autenticacao =
        verificarSenha(
            dados,
            env
        );


    if (
        !autenticacao.ok
    ) {

        return autenticacao.resposta;
    }


    return resposta({

        sucesso:
            true,

        mensagem:
            "Acesso administrativo autorizado."
    });

}

/* ========================================================= CONSULTAR
PROTOCOLO ========================================================= */

async function consultarProtocolo( env, protocolo ) {

    if (!protocolo) {

        return resposta(
            {
                encontrado:
                    false,

                erro:
                    "Informe o número do protocolo."
            },

            400
        );
    }


    const protocoloNormalizado =
        String(
            protocolo
        )
        .trim()
        .toUpperCase();


    const chamado =
        await buscarChamado(
            env,
            protocoloNormalizado
        );


    if (!chamado) {

        return resposta(
            {
                encontrado:
                    false,

                erro:
                    "Protocolo não encontrado."
            },

            404
        );
    }


    return resposta({

        encontrado:
            true,

        chamado:
            chamado
    });

}

/* ========================================================= SERVIR
INDEX.HTML ========================================================= */

async function servirIndex( request, env ) {

    return env.ASSETS.fetch(

        new Request(

            new URL(
                "/index.html",
                request.url
            ),

            request
        )
    );

}

/* ========================================================= FUNÇÃO
PRINCIPAL ========================================================= */

export default {

    async fetch(
        request,
        env
    ) {

        /*
         * CORS / OPTIONS
         */

        if (
            request.method ===
            "OPTIONS"
        ) {

            return resposta({

                sucesso:
                    true
            });
        }


        try {

            const url =
                new URL(
                    request.url
                );


            const pathname =
                url.pathname;


            /*
             * =================================================
             * API
             * =================================================
             */

            const ehAPI =
                pathname === "/api/protocolo";


            /*
             * =================================================
             * CONSULTA POR PROTOCOLO
             * =================================================
             */

            if (
                request.method ===
                    "GET" &&
                ehAPI
            ) {

                return consultarProtocolo(

                    env,

                    url.searchParams.get(
                        "protocolo"
                    )
                );
            }


            /*
             * =================================================
             * CONSULTA DIRETA
             * =================================================
             */

            if (
                request.method ===
                    "GET" &&

                pathname === "/" &&

                url.searchParams.has(
                    "protocolo"
                )
            ) {

                return consultarProtocolo(

                    env,

                    url.searchParams.get(
                        "protocolo"
                    )
                );
            }


            /*
             * =================================================
             * PÁGINA PRINCIPAL
             * =================================================
             */

            if (
                request.method ===
                    "GET" &&

                pathname === "/"
            ) {

                return servirIndex(
                    request,
                    env
                );
            }


            /*
             * =================================================
             * OUTROS ARQUIVOS
             * =================================================
             */

            if (
                request.method ===
                "GET"
            ) {

                return env.ASSETS.fetch(
                    request
                );
            }


            /*
             * =================================================
             * SOMENTE POST A PARTIR DAQUI
             * =================================================
             */

            if (
                request.method !==
                "POST"
            ) {

                return resposta(
                    {
                        sucesso:
                            false,

                        erro:
                            "Método não permitido."
                    },

                    405
                );
            }


            /*
             * =================================================
             * LER JSON
             * =================================================
             */

            let dados;


            try {

                dados =
                    await request.json();

            } catch {

                return resposta(
                    {
                        sucesso:
                            false,

                        erro:
                            "Dados inválidos."
                    },

                    400
                );
            }


            /*
             * =================================================
             * LOGIN
             * =================================================
             */

            if (
                dados.action ===
                "login"
            ) {

                return login(
                    env,
                    dados
                );
            }


            /*
             * =================================================
             * LISTAR TODOS
             * =================================================
             */

            if (
                dados.action ===
                "list"
            ) {

                const autenticacao =
                    verificarSenha(
                        dados,
                        env
                    );


                if (
                    !autenticacao.ok
                ) {

                    return autenticacao.resposta;
                }


                const resultado =
                    await listarChamados(
                        env
                    );


                return resposta({

                    sucesso:
                        true,

                    chamados:
                        resultado.chamados,

                    chamadosArquivados:
                        resultado.chamadosArquivados,

                    estatisticas:
                        resultado.estatisticas
                });
            }



            /*
             * =================================================
             * ADVERTÊNCIAS / NOTIFICAÇÕES
             * =================================================
             */

            if (dados.action === "listAdministrative") {

                const autenticacao =
                    verificarSenha(dados, env);

                if (!autenticacao.ok) {
                    return autenticacao.resposta;
                }

                try {

                    const medidas =
                        await listarMedidasAdministrativas(env);

                    return resposta({
                        sucesso: true,
                        medidas
                    });

                } catch (erro) {

                    console.error(
                        "ERRO AO LISTAR ADVERTÊNCIAS/NOTIFICAÇÕES:",
                        erro
                    );

                    return resposta({
                        sucesso: false,
                        erro:
                            "Não foi possível acessar as Advertências/Notificações.",
                        detalhe:
                            erro?.message || String(erro)
                    }, 500);
                }
            }

            if (dados.action === "createAdministrative") {

                const autenticacao =
                    verificarSenha(dados, env);

                if (!autenticacao.ok) {
                    return autenticacao.resposta;
                }

                try {

                    return await criarMedidaAdministrativa(
                        env,
                        dados
                    );

                } catch (erro) {

                    console.error(
                        "ERRO AO CRIAR ADVERTÊNCIA/NOTIFICAÇÃO:",
                        erro
                    );

                    return resposta({
                        sucesso: false,
                        erro:
                            "Não foi possível gravar a Advertência/Notificação.",
                        detalhe:
                            erro?.message || String(erro)
                    }, 500);
                }
            }

            if (dados.action === "deleteAdministrative") {

                const autenticacao =
                    verificarSenha(dados, env);

                if (!autenticacao.ok) {
                    return autenticacao.resposta;
                }

                try {

                    return await excluirMedidaAdministrativa(
                        env,
                        dados
                    );

                } catch (erro) {

                    console.error(
                        "ERRO AO EXCLUIR ADVERTÊNCIA/NOTIFICAÇÃO:",
                        erro
                    );

                    return resposta({
                        sucesso: false,
                        erro:
                            "Não foi possível excluir o registro administrativo.",
                        detalhe:
                            erro?.message || String(erro)
                    }, 500);
                }
            }


            /*
             * =================================================
             * ATUALIZAR
             * =================================================
             */

            if (
                dados.action ===
                "update"
            ) {

                const autenticacao =
                    verificarSenha(
                        dados,
                        env
                    );


                if (
                    !autenticacao.ok
                ) {

                    return autenticacao.resposta;
                }


                return atualizarChamado(

                    env,

                    dados
                );
            }


            /*
             * =================================================
             * ARQUIVAR
             * =================================================
             */

            if (
                dados.action ===
                "archive"
            ) {

                const autenticacao =
                    verificarSenha(
                        dados,
                        env
                    );

                if (
                    !autenticacao.ok
                ) {
                    return autenticacao.resposta;
                }

                return arquivarChamado(
                    env,
                    dados
                );
            }


            /*
             * =================================================
             * REABRIR
             * =================================================
             */

            if (
                dados.action ===
                "reopen"
            ) {

                const autenticacao =
                    verificarSenha(
                        dados,
                        env
                    );

                if (
                    !autenticacao.ok
                ) {
                    return autenticacao.resposta;
                }

                return reabrirChamado(
                    env,
                    dados
                );
            }


            /*
             * =================================================
             * EXCLUIR
             * =================================================
             */

            if (
                dados.action ===
                "delete"
            ) {

                const autenticacao =
                    verificarSenha(
                        dados,
                        env
                    );


                if (
                    !autenticacao.ok
                ) {

                    return autenticacao.resposta;
                }


                return excluirChamado(

                    env,

                    dados
                );
            }


            /*
             * =================================================
             * CRIAR CHAMADO
             * =================================================
             */

            return criarChamado(

                env,

                dados
            );

        }

        catch (erro) {

            console.error(
                "ERRO NO WORKER:",
                erro
            );


            return resposta(
                {
                    sucesso:
                        false,

                    erro:
                        "Erro interno no sistema.",

                    detalhe:
                        erro?.message ||
                        ""
                },

                500
            );
        }
    }

};
