import { getStore } from "@netlify/blobs";

export default async function handler(request) {

    if (request.method !== "POST") {

        return new Response(
            JSON.stringify({
                erro: "Método não permitido."
            }),
            {
                status: 405,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

    }


    try {

        // =========================================
        // DATA ATUAL - HORÁRIO DE BRASÍLIA
        // =========================================

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


        const ano =
            partes.find(
                p => p.type === "year"
            ).value;


        const mes =
            partes.find(
                p => p.type === "month"
            ).value;


        const dia =
            partes.find(
                p => p.type === "day"
            ).value;


        // =========================================
        // ARMAZENAMENTO CENTRAL
        // =========================================

        /*
         * IMPORTANTE:
         * O nome do armazenamento é passado
         * diretamente para getStore().
         */

        const store =
            getStore(
                "protocolos-parque-clube"
            );


        // =========================================
        // CONTADOR DO DIA
        // =========================================

        const chave =
            `contador-${ano}-${mes}-${dia}`;


        // =========================================
        // TENTATIVAS
        // =========================================

        for (
            let tentativa = 0;
            tentativa < 20;
            tentativa++
        ) {


            // Busca o contador atual

            const atual =
                await store.getWithMetadata(
                    chave,
                    {
                        consistency:
                            "strong"
                    }
                );


            // =====================================
            // PRIMEIRO CHAMADO DO DIA
            // =====================================

            if (
                !atual ||
                atual.data === null
            ) {


                const resultado =
                    await store.set(
                        chave,
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
                        `PC-${dia}-${mes}-${String(ano).slice(-2)}-001`;


                    console.log(
                        "PROTOCOLO GERADO:",
                        protocolo
                    );


                    return new Response(

                        JSON.stringify({
                            protocolo:
                                protocolo
                        }),

                        {
                            status: 200,

                            headers: {
                                "Content-Type":
                                    "application/json"
                            }
                        }

                    );

                }


                // Outro usuário criou primeiro.
                // Tenta novamente.

                continue;

            }


            // =====================================
            // RECUPERA CONTADOR ATUAL
            // =====================================

            let numeroAtual =
                parseInt(
                    atual.data,
                    10
                );


            if (
                isNaN(numeroAtual)
            ) {

                numeroAtual = 0;

            }


            // Próximo número

            const novoNumero =
                numeroAtual + 1;


            // =====================================
            // ATUALIZA CONTADOR
            // =====================================

            const resultado =
                await store.set(
                    chave,
                    String(novoNumero),
                    {
                        onlyIfMatch:
                            atual.etag
                    }
                );


            // =====================================
            // ATUALIZAÇÃO REALIZADA
            // =====================================

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
                    `PC-${dia}-${mes}-${String(ano).slice(-2)}-${sequencial}`;


                console.log(
                    "PROTOCOLO GERADO:",
                    protocolo
                );


                return new Response(

                    JSON.stringify({
                        protocolo:
                            protocolo
                    }),

                    {
                        status: 200,

                        headers: {
                            "Content-Type":
                                "application/json"
                        }
                    }

                );

            }


            // Se houve conflito,
            // tenta novamente.

        }


        // =========================================
        // FALHA APÓS AS TENTATIVAS
        // =========================================

        return new Response(

            JSON.stringify({
                erro:
                    "Não foi possível gerar o protocolo."
            }),

            {
                status: 503,

                headers: {
                    "Content-Type":
                        "application/json"
                }
            }

        );


    } catch (erro) {

        // =========================================
        // ERRO REAL DA FUNCTION
        // =========================================

        console.error(
            "ERRO PROTOCOLO:",
            erro
        );


        return new Response(

            JSON.stringify({

                erro:
                    "Erro interno ao gerar protocolo.",

                detalhe:
                    erro.message

            }),

            {
                status: 500,

                headers: {
                    "Content-Type":
                        "application/json"
                }
            }

        );

    }

}
