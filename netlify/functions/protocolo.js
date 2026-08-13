import { getStore } from "@netlify/blobs";

const store = getStore("protocolos-parque-clube");


/* =====================================================
   RESPOSTA PADRÃO
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
       ACEITA GET E POST
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
           CONSULTAR PROTOCOLO
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
           POST
           
           Pode ser:
           
           1. Criar chamado
           2. Atualizar chamado
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
           ATUALIZAR CHAMADO - ADMIN
        ================================================= */

        if (
            dados.action ===
            "update"
        ) {


            /* =============================================
               VERIFICAR SENHA
            ============================================= */

            const senhaAdmin =
                process.env.ADMIN_PASSWORD;


            if (
                !senhaAdmin
            ) {

                console.error(
                    "ADMIN_PASSWORD não configurada."
                );


                return resposta(
                    {
                        erro:
                            "A senha administrativa ainda não foi configurada no Netlify."
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


            /* =============================================
               VALIDAR PROTOCOLO
            ============================================= */

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


            /* =============================================
               BUSCAR CHAMADO
            ============================================= */

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


            if (!chamadoAtual) {

                return resposta(
                    {
                        erro:
                            "Protocolo não encontrado."
                    },

                    404
                );

            }


            /* =============================================
               STATUS
            ============================================= */

            const statusPermitidos = [

                "Aberto",

                "Em andamento",

                "Resolvido",

                "Cancelado"

            ];


            const novoStatus =
                dados.status;


            if (
                !statusPermitidos.includes(
                    novoStatus
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


            /* =============================================
               ATUALIZA DADOS
            ============================================= */

            const dataAtual =
                obterDataBrasilia();


            const horaAtual =
                obterHoraBrasilia();


            const chamadoAtualizado = {

                ...chamadoAtual,

                status:
                    novoStatus,

                responsavel:
                    dados.responsavel ||
                    chamadoAtual.responsavel ||
                    "",

                observacaoSolucao:
                    dados.observacaoSolucao ||
                    chamadoAtual.observacaoSolucao ||
                    "",

                ultimaAtualizacao:
                    `${dataAtual.dia}/${dataAtual.mes}/${dataAtual.ano} ${horaAtual}`

            };


            /* =============================================
               SE RESOLVIDO
            ============================================= */

            if (
                novoStatus ===
                "Resolvido"
            ) {

                chamadoAtualizado.dataConclusao =
                    `${dataAtual.dia}/${dataAtual.mes}/${dataAtual.ano}`;

                chamadoAtualizado.horaConclusao =
                    horaAtual;

            }


            /* =============================================
               SALVAR
            ============================================= */

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
           GERAR PROTOCOLO
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
               PRIMEIRO CHAMADO DO DIA
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
               CONTADOR EXISTENTE
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
               ATUALIZA CONTADOR
            ============================================= */

            const resultado =
                await store.set(

                    chaveContador,

                    String(novoNumero),

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
           ERRO DE GERAÇÃO
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
