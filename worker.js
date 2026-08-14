/*
============================================================
 PARQUE CLUBE - CLOUDFLARE WORKER
 Sistema de Chamados / Ordem de Serviço

 D1:
 Binding: DB

 Secret:
 ADMIN_PASSWORD

 API OFICIAL:
 /api/protocolo

 ROTA ANTIGA MANTIDA TEMPORARIAMENTE:
 /.netlify/functions/protocolo
============================================================
*/


/* =========================================================
   RESPOSTA JSON
========================================================= */

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


/* =========================================================
   DATA DE BRASÍLIA
========================================================= */

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


/* =========================================================
   HORA DE BRASÍLIA
========================================================= */

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

function verificarSenha(
    dados,
    env
) {

    /*
     * Remove espaços acidentais do Secret
     * e da senha enviada pelo navegador.
     */

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


/* =========================================================
   CONVERTER CHAMADO
========================================================= */

function converterChamado(row) {

    if (!row) {
        return null;
    }


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
            row.criado_em || ""
    };
}


/* =========================================================
   BUSCAR CHAMADO
========================================================= */

async function buscarChamado(
    env,
    protocolo
) {

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


    return converterChamado(
        resultado
    );
}


/* =========================================================
   LISTAR TODOS
========================================================= */

async function listarChamados(
    env
) {

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


    const chamados =
        (
            resultado.results ||
            []
        )
        .map(
            converterChamado
        )
        .filter(Boolean);


    const estatisticas = {

        total:
            chamados.length,

        abertos:
            chamados.filter(
                c =>
                    c.status ===
                    "Aberto"
            ).length,

        andamento:
            chamados.filter(
                c =>
                    c.status ===
                    "Em andamento"
            ).length,

        resolvidos:
            chamados.filter(
                c =>
                    c.status ===
                    "Resolvido"
            ).length,

        cancelados:
            chamados.filter(
                c =>
                    c.status ===
                    "Cancelado"
            ).length
    };


    return {

        chamados,

        estatisticas
    };
}


/* =========================================================
   CRIAR CHAMADO
========================================================= */

async function criarChamado(
    env,
    dados
) {

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
                criado_em

            )

            VALUES (

                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?

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


/* =========================================================
   ATUALIZAR CHAMADO
========================================================= */

async function atualizarChamado(
    env,
    dados
) {

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


/* =========================================================
   LOGIN
========================================================= */

async function login(
    env,
    dados
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


    return resposta({

        sucesso:
            true,

        mensagem:
            "Acesso administrativo autorizado."
    });
}


/* =========================================================
   CONSULTAR PROTOCOLO
========================================================= */

async function consultarProtocolo(
    env,
    protocolo
) {

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


/* =========================================================
   SERVIR INDEX.HTML
========================================================= */

async function servirIndex(
    request,
    env
) {

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


/* =========================================================
   FUNÇÃO PRINCIPAL
========================================================= */

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
             *
             * NOVA ROTA:
             * /api/protocolo
             *
             * ROTA ANTIGA:
             * /.netlify/functions/protocolo
             *
             * A antiga fica temporariamente ativa.
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
             *
             * /?protocolo=...
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
             * POST
             *
             * A API aceita POST na rota nova e também
             * na rota antiga durante a transição.
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
