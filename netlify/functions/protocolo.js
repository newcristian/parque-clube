import { getStore } from "@netlify/blobs";

const store = getStore("protocolos-parque-clube");

function resposta(dados, status = 200) {
    return new Response(
        JSON.stringify(dados),
        {
            status,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );
}

function dataBrasilia() {

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
        ano: partes.find(
            p => p.type === "year"
        ).value,

        mes: partes.find(
            p => p.type === "month"
        ).value,

        dia: partes.find(
            p => p.type === "day"
        ).value
    };
}


export default async function handler(request) {

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

        /*
         * =====================================
         * CONSULTAR PROTOCOLO
         * =====================================
         */

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
                            "Informe o protocolo."
                    },
                    400
                );

            }


            const chamado =
                await store.get(
                    `chamado-${protocolo}`,
                    {
                        type: "json"
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


        /*
         * =====================================
         * GERAR PROTOCOLO
         * =====================================
         */

        const dados =
            dataBrasilia();


        const chaveContador =
            `contador-${dados.ano}-${dados.mes}-${dados.dia}`;


        /*
         * =====================================
         * TENTATIVAS PARA EVITAR
         * PROTOCOLOS REPETIDOS
         * =====================================
         */

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


            /*
             * PRIMEIRO CHAMADO DO DIA
             */

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
                        `PC-${dados.dia}-${dados.mes}-${String(dados.ano).slice(-2)}-001`;


                    return resposta(
                        {
                            protocolo:
                                protocolo
                        }
                    );

                }


                continue;

            }


            /*
             * RECUPERA CONTADOR
             */

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


            const novoNumero =
                numeroAtual + 1;


            /*
             * ATUALIZA CONTADOR
             */

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
                    `PC-${dados.dia}-${dados.mes}-${String(dados.ano).slice(-2)}-${sequencial}`;


                return resposta(
                    {
                        protocolo:
                            protocolo
                    }
                );

            }

        }


        return resposta(
            {
                erro:
                    "Não foi possível gerar o protocolo."
            },
            503
        );


    } catch (erro) {

        console.error(
            "ERRO PROTOCOLO:",
            erro
        );


        return resposta(
            {
                erro:
                    "Erro interno.",

                detalhe:
                    erro.message
            },
            500
        );

    }

}
