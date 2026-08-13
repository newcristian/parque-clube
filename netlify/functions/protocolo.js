import { getStore } from "@netlify/blobs";

const store = getStore("protocolos-parque-clube");


/* =====================================================
   RESPOSTA
===================================================== */

function resposta(dados, status = 200) {

    return new Response(
        JSON.stringify(dados),
        {
            status: status,

            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }
    );

}


/* =====================================================
   DATA DE BRASÍLIA
===================================================== */

function obterDataBrasilia() {

    const agora = new Date();

    const partes =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: "America/Sao_Paulo",

                year: "numeric",

                month: "2-digit",

                day: "2-digit"
            }
        ).formatToParts(agora);


    return {

        ano:
            partes.find(
                p => p.type === "year"
            ).value,

        mes:
            partes.find(
                p => p.type === "month"
            ).value,

        dia:
            partes.find(
                p => p.type === "day"
            ).value

    };

}


/* =====================================================
   HORA DE BRASÍLIA
===================================================== */

function obterHoraBrasilia() {

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            timeZone:
                "America/Sao_Paulo",

            hour:
                "2-digit",

            minute:
                "2-digit",

            second:
                "2-digit",

            hour12:
                false
        }
    ).format(
        new Date()
    );

}


/* =====================================================
   FUNÇÃO PRINCIPAL
===================================================== */

export default async function handler(request) {


    /* =================================================
       MÉTODOS PERMITIDOS
    ================================================= */

    if (
        request.method !== "POST" &&
        request.method !== "GET"
    ) {

        return resposta(
            {
                erro:
                    "Método não permitido."
            },

            405
        );

    }


    try {


        /* =================================================
           CONSULTAR UM PROTOCOLO
        ================================================= */

        if (
            request.method === "GET"
        ) {


            const url =
                new URL(
                    request.url
                );


            const protocolo =
                url.searchParams.get(
                    "protocolo"
                );


            if (!protocolo) {

                return resposta(
                    {
                        erro:
                            "Informe o número do protocolo."
                    },

                    400
                );

            }


            const protocoloNormalizado =
                protocolo
                    .trim()
                    .toUpperCase();


            const chamado =
                await store.get(

                    `chamado-${protocoloNormalizado}`,

                    {
                        type:
                            "json",

                        consistency:
                            "strong"
                    }

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


            return resposta(
                {
                    encontrado:
                        true,

                    chamado:
                        chamado
                }
            );

        }


        /* =================================================
           LER JSON DO POST
        ================================================= */

        let dados = {};


        try {

            dados =
                await request.json();

        }

        catch {

            return resposta(
                {
                    erro:
                        "Dados inválidos."
                },

                400
            );

        }


        /* =================================================
           LISTAR TODOS OS PROTOCOLOS
           SOMENTE ADMINISTRADOR
        ================================================= */

        if (
            dados.action ===
            "list"
        ) {


            const senhaAdmin =
                process.env.ADMIN_PASSWORD;


            if (
                !senhaAdmin
            ) {

                return resposta(
                    {
                        erro:
                            "A senha administrativa não está configurada."
                    },

                    500
                );

            }


            if (
                !dados.adminPassword ||
                dados.adminPassword !==
                senhaAdmin
            ) {

                return resposta(
                    {
                        erro:
                            "Senha administrativa incorreta."
                    },

                    401
                );

            }


            const chamadosValidos =
                [];


            let cursor;


            /* =============================================
               PAGINAÇÃO
            ============================================= */

            do {

                const pagina =
                    await store.list(
                        {
                            prefix:
                                "chamado-",

                            cursor:
                                cursor
                        }
                    );


                for (
                    const blob
                    of pagina.blobs || []
                ) {


                    try {

                        const chamado =
                            await store.get(

                                blob.key,

                                {
                                    type:
                                        "json",

                                    consistency:
                                        "strong"
                                }

                            );


                        if (
                            chamado &&
                            chamado.protocolo
                        ) {

                            chamadosValidos.push(
                                chamado
                            );

                        }

                    }

                    catch (erro) {

                        console.error(
                            "Erro ao ler:",
                            blob.key,

                            erro
                        );

                    }

                }


                cursor =
                    pagina.cursor;


            }

            while (
                cursor
            );


            /* =============================================
               ORDENAR DO MAIS NOVO
            ============================================= */

            chamadosValidos.sort(

                (a, b) =>

                    String(
                        b.protocolo
                    ).localeCompare(

                        String(
                            a.protocolo
                        ),

                        undefined,

                        {
                            numeric:
                                true
                        }

                    )

            );


            /* =============================================
               ESTATÍSTICAS
            ============================================= */

            const estatisticas = {

                total:
                    chamadosValidos.length,


                abertos:
                    chamadosValidos.filter(

                        chamado =>

                            chamado.status ===
                            "Aberto"

                    ).length,


                andamento:
                    chamadosValidos.filter(

                        chamado =>

                            chamado.status ===
                            "Em andamento"

                    ).length,


                resolvidos:
                    chamadosValidos.filter(

                        chamado =>

                            chamado.status ===
                            "Resolvido"

                    ).length,


                cancelados:
                    chamadosValidos.filter(

                        chamado =>

                            chamado.status ===
                            "Cancelado"

                    ).length

            };


            return resposta(
                {

                    sucesso:
                        true,

                    chamados:
                        chamadosValidos,

                    estatisticas:
                        estatisticas

                }
            );

        }


        /* =================================================
           ATUALIZAR CHAMADO
           SOMENTE ADMINISTRADOR
        ================================================= */

        if (
            dados.action ===
            "update"
        ) {


            const senhaAdmin =
                process.env.ADMIN_PASSWORD;


            if (
                !senhaAdmin
            ) {

                return resposta(
                    {
                        erro:
                            "A senha administrativa não está configurada."
                    },

                    500
                );

            }


            if (
                !dados.adminPassword ||
                dados.adminPassword !==
                senhaAdmin
            ) {

                return resposta(
                    {
                        erro:
                            "Senha administrativa incorreta."
                    },

                    401
                );

            }


            if (
                !dados.protocolo
            ) {

                return resposta(
                    {
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
                await store.get(

                    `chamado-${protocolo}`,

                    {
                        type:
                            "json",

                        consistency:
                            "strong"
                    }

                );


            if (
                !chamadoAtual
            ) {

                return resposta(
                    {
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
                        erro:
                            "Status inválido."
                    },

                    400
                );

            }


            const dataAtual =
                obterDataBrasilia();


            const horaAtual =
                obterHoraBrasilia();


            const chamadoAtualizado = {

                ...chamadoAtual,

                status:
                    dados.status,

                responsavel:
                    dados.responsavel ||
                    "",

                observacaoSolucao:
                    dados.observacaoSolucao ||
                    "",

                ultimaAtualizacao:

                    `${dataAtual.dia}/${dataAtual.mes}/${dataAtual.ano} ${horaAtual}`

            };


            /* =============================================
               RESOLVIDO
            ============================================= */

            if (
                dados.status ===
                "Resolvido"
            ) {

                chamadoAtualizado.dataConclusao =

                    `${dataAtual.dia}/${dataAtual.mes}/${dataAtual.ano}`;


                chamadoAtualizado.horaConclusao =
                    horaAtual;

            }

            else {

                delete
                    chamadoAtualizado.dataConclusao;

                delete
                    chamadoAtualizado.horaConclusao;

            }


            await store.setJSON(

                `chamado-${protocolo}`,

                chamadoAtualizado

            );


            return resposta(
                {

                    sucesso:
                        true,

                    mensagem:
                        "Chamado atualizado com sucesso.",

                    chamado:
                        chamadoAtualizado

                }
            );

        }


        /* =================================================
           CRIAR NOVO CHAMADO
        ================================================= */

        const data =
            obterDataBrasilia();


        const chaveContador =

            `contador-${data.ano}-${data.mes}-${data.dia}`;


        /* =================================================
           TENTATIVAS PARA EVITAR PROTOCOLOS REPETIDOS
        ================================================= */

        for (
            let tentativa = 0;

            tentativa < 20;

            tentativa++
        ) {


            const atual =
                await store.getWithMetadata(

                    chaveContador,

                    {
                        consistency:
                            "strong"
                    }

                );


            /* =============================================
               PRIMEIRO PROTOCOLO DO DIA
            ============================================= */

            if (
                !atual ||
                atual.data === null
            ) {


                const resultado =
                    await store.set(

                        chaveContador,

                        "1",

                        {
                            onlyIfNew:
                                true
                        }

                    );


                if (
                    resultado.modified
                ) {


                    const protocolo =

                        `PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-001`;


                    const chamado = {

                        protocolo:
                            protocolo,


                        dataAbertura:

                            `${data.dia}/${data.mes}/${data.ano}`,


                        horaAbertura:
                            obterHoraBrasilia(),


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
                            ""

                    };


                    await store.setJSON(

                        `chamado-${protocolo}`,

                        chamado

                    );


                    return resposta(
                        {

                            sucesso:
                                true,

                            protocolo:
                                protocolo,

                            chamado:
                                chamado

                        }
                    );

                }


                continue;

            }


            /* =============================================
               CONTADOR JÁ EXISTENTE
            ============================================= */

            let numeroAtual =

                parseInt(
                    atual.data,
                    10
                );


            if (
                isNaN(numeroAtual)
            ) {

                numeroAtual =
                    0;

            }


            const novoNumero =
                numeroAtual + 1;


            /* =============================================
               ATUALIZAR CONTADOR COM SEGURANÇA
            ============================================= */

            const resultado =
                await store.set(

                    chaveContador,

                    String(
                        novoNumero
                    ),

                    {

                        onlyIfMatch:
                            atual.etag

                    }

                );


            if (
                resultado.modified
            ) {


                const sequencial =

                    String(
                        novoNumero
                    )
                    .padStart(
                        3,
                        "0"
                    );


                const protocolo =

                    `PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-${sequencial}`;


                const chamado = {

                    protocolo:
                        protocolo,


                    dataAbertura:

                        `${data.dia}/${data.mes}/${data.ano}`,


                    horaAbertura:
                        obterHoraBrasilia(),


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
                        ""

                };


                await store.setJSON(

                    `chamado-${protocolo}`,

                    chamado

                );


                return resposta(
                    {

                        sucesso:
                            true,

                        protocolo:
                            protocolo,

                        chamado:
                            chamado

                    }
                );

            }

        }


        /* =================================================
           NÃO FOI POSSÍVEL GERAR
        ================================================= */

        return resposta(
            {

                sucesso:
                    false,

                erro:
                    "Não foi possível gerar o protocolo. Tente novamente."

            },

            503

        );

    }

    catch (erro) {


        console.error(

            "ERRO NA FUNCTION PROTOCOLO:",

            erro

        );


        return resposta(
            {

                sucesso:
                    false,

                erro:
                    "Erro interno no sistema.",

                detalhe:
                    erro.message

            },

            500

        );

    }

}
