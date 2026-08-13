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
   DATA ATUAL - HORÁRIO DE BRASÍLIA
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
   FUNÇÃO PRINCIPAL
===================================================== */

export default async function handler(request) {


    /* =================================================
       MÉTODO
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
           
           Exemplo:
           /api/protocolo?protocolo=PC-13-08-26-001
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


            const chave =
                `chamado-${protocolo}`;


            const chamado =
                await store.get(
                    chave,

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
           ABRIR NOVO CHAMADO
        ================================================= */


        let dadosChamado = {};


        /*
         * Tenta receber JSON.
         *
         * O index.html poderá enviar:
         *
         * {
         *   solicitante: "...",
         *   cargo: "...",
         *   bloco: "...",
         *   andar: "...",
         *   ocorrencia: "...",
         *   detalhes: "..."
         * }
         */

        try {

            dadosChamado =
                await request.json();

        }

        catch {

            /*
             * Caso o formulário ainda não esteja
             * enviando JSON, não interrompe a geração
             * do protocolo.
             */

            dadosChamado = {};

        }


        /* =================================================
           DATA
        ================================================= */

        const data =
            obterDataBrasilia();


        const chaveContador =
            `contador-${data.ano}-${data.mes}-${data.dia}`;


        /* =================================================
           GERAR PROTOCOLO
           
           Exemplo:
           PC-13-08-26-001
        ================================================= */

        for (
            let tentativa = 0;
            tentativa < 20;
            tentativa++
        ) {


            /* =============================================
               VERIFICA CONTADOR ATUAL
            ============================================= */

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


                /*
                 * Se conseguiu criar o contador,
                 * este é o protocolo 001.
                 */

                if (
                    resultado.modified
                ) {


                    const protocolo =
                        `PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-001`;


                    /* =====================================
                       SALVA O CHAMADO
                    ===================================== */

                    const chamado = {

                        protocolo:
                            protocolo,

                        dataAbertura:
                            `${data.dia}/${data.mes}/${data.ano}`,

                        status:
                            "Aberto",

                        ...dadosChamado

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


                /*
                 * Outro usuário criou primeiro.
                 * Tenta novamente.
                 */

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
               
               O protocolo só será confirmado se o
               contador não tiver sido alterado por
               outro usuário.
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
                    ).padStart(
                        3,
                        "0"
                    );


                const protocolo =
                    `PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-${sequencial}`;


                /* =====================================
                   SALVA O CHAMADO
                ===================================== */

                const chamado = {

                    protocolo:
                        protocolo,

                    dataAbertura:
                        `${data.dia}/${data.mes}/${data.ano}`,

                    status:
                        "Aberto",

                    ...dadosChamado

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


            /*
             * Outro usuário alterou o contador.
             * Tenta novamente.
             */

        }


        /* =================================================
           NÃO CONSEGUIU GERAR
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


        /* =================================================
           ERRO
        ================================================= */

        console.error(
            "ERRO NA FUNCTION PROTOCOLO:",
            erro
        );


        return resposta(

            {
                sucesso:
                    false,

                erro:
                    "Erro interno ao gerar o protocolo.",

                detalhe:
                    erro.message
            },

            500

        );

    }

}
