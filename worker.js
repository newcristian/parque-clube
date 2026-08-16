/*

PARQUE CLUBE - CLOUDFLARE WORKER Sistema de Chamados / Ordem de Serviço

D1: Binding: DB

Secret: ADMIN_PASSWORD

API OFICIAL: /api/protocolo

ROTA ANTIGA MANTIDA TEMPORARIAMENTE: /.netlify/functions/protocolo
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

                pathname ===
                    "/api/protocolo"

                ||

                pathname ===
                    "/.netlify/functions/protocolo";


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
