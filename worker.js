export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    /*
     * =====================================================
     * CORS
     * =====================================================
     */

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type",
      "Content-Type":
        "application/json; charset=UTF-8"
    };

    if (request.method === "OPTIONS") {

      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders
        }
      );

    }


    /*
     * =====================================================
     * API
     * =====================================================
     */

    if (
      url.pathname ===
      "/api/protocolo"
    ) {

      try {

        /*
         * -------------------------------------------------
         * GET
         * Consulta de protocolo
         * -------------------------------------------------
         */

        if (
          request.method === "GET"
        ) {

          const protocolo =
            url.searchParams.get(
              "protocolo"
            );

          if (!protocolo) {

            return new Response(
              JSON.stringify({
                erro:
                  "Informe o protocolo."
              }),
              {
                status: 400,
                headers:
                  corsHeaders
              }
            );

          }

          const chamado =
            await env.DB
              .prepare(
                `
                SELECT *
                FROM chamados
                WHERE protocolo = ?
                LIMIT 1
                `
              )
              .bind(protocolo)
              .first();

          if (!chamado) {

            return new Response(
              JSON.stringify({
                encontrado:
                  false,

                erro:
                  "Protocolo não encontrado."
              }),
              {
                status: 404,
                headers:
                  corsHeaders
              }
            );

          }

          return new Response(
            JSON.stringify({
              encontrado:
                true,

              chamado:
                chamado
            }),
            {
              status: 200,
              headers:
                corsHeaders
            }
          );

        }


        /*
         * -------------------------------------------------
         * POST
         * -------------------------------------------------
         */

        if (
          request.method === "POST"
        ) {

          const dados =
            await request.json();

          /*
           * =================================================
           * LOGIN ADMINISTRATIVO
           * =================================================
           */

          if (
            dados.action ===
            "login"
          ) {

            const senha =
              String(
                dados.senha || ""
              );

            const senhaAdmin =
              String(
                env.ADMIN_PASSWORD || ""
              );

            if (
              !senhaAdmin
            ) {

              return new Response(
                JSON.stringify({
                  sucesso:
                    false,

                  erro:
                    "ADMIN_PASSWORD não configurada no Worker."
                }),
                {
                  status: 500,
                  headers:
                    corsHeaders
                }
              );

            }

            if (
              senha !==
              senhaAdmin
            ) {

              return new Response(
                JSON.stringify({
                  sucesso:
                    false,

                  erro:
                    "Senha administrativa incorreta."
                }),
                {
                  status: 401,
                  headers:
                    corsHeaders
                }
              );

            }

            return new Response(
              JSON.stringify({
                sucesso:
                  true
              }),
              {
                status: 200,
                headers:
                  corsHeaders
              }
            );

          }


          /*
           * =================================================
           * LISTAR CHAMADOS
           * =================================================
           */

          if (
            dados.action ===
            "listar"
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

            return new Response(
              JSON.stringify({
                sucesso:
                  true,

                chamados:
                  resultado.results || []
              }),
              {
                status: 200,
                headers:
                  corsHeaders
              }
            );

          }


          /*
           * =================================================
           * ATUALIZAR CHAMADO
           * =================================================
           */

          if (
            dados.action ===
            "atualizar"
          ) {

            const id =
              dados.id;

            const status =
              dados.status || "";

            const responsavel =
              dados.responsavel || "";

            const observacao =
              dados.observacao_solucao ||
              "";

            const agora =
              new Date()
                .toISOString();

            await env.DB
              .prepare(
                `
                UPDATE chamados

                SET
                  status = ?,
                  responsavel = ?,
                  observacao_solucao = ?,
                  ultima_atualizacao = ?

                WHERE id = ?
                `
              )
              .bind(
                status,
                responsavel,
                observacao,
                agora,
                id
              )
              .run();

            return new Response(
              JSON.stringify({
                sucesso:
                  true
              }),
              {
                status: 200,
                headers:
                  corsHeaders
              }
            );

          }


          /*
           * =================================================
           * CRIAR CHAMADO
           * =================================================
           */

          const hoje =
            new Date();

          const data =
            hoje
              .toISOString()
              .slice(
                0,
                10
              );

          const hora =
            hoje
              .toISOString()
              .slice(
                11,
                19
              );

          /*
           * Contador diário
           */

          const contador =
            await env.DB
              .prepare(
                `
                SELECT numero
                FROM contadores
                WHERE data = ?
                `
              )
              .bind(data)
              .first();

          let numero;

          if (contador) {

            numero =
              Number(
                contador.numero
              ) + 1;

            await env.DB
              .prepare(
                `
                UPDATE contadores
                SET numero = ?
                WHERE data = ?
                `
              )
              .bind(
                numero,
                data
              )
              .run();

          } else {

            numero = 1;

            await env.DB
              .prepare(
                `
                INSERT INTO contadores
                (
                  data,
                  numero
                )
                VALUES (?, ?)
                `
              )
              .bind(
                data,
                numero
              )
              .run();

          }


          /*
           * Protocolo
           */

          const protocolo =
            "PC-" +
            data
              .split("-")
              .reverse()
              .join("")
              .slice(0, 6) +
            "-" +
            String(
              numero
            ).padStart(
              3,
              "0"
            );


          /*
           * Dados do chamado
           */

          const solicitante =
            dados.solicitante ||
            "";

          const cargo =
            dados.cargo ||
            "";

          const bloco =
            dados.bloco ||
            "";

          const pavimentos =
            dados.pavimentos ||
            "";

          const ocorrencia =
            dados.ocorrencia ||
            dados.tipo_ocorrencia ||
            "";

          const detalhes =
            dados.detalhes ||
            "";

          const dataOcorrencia =
            dados.dataOcorrencia ||
            dados.data_ocorrencia ||
            "";

          const horaInicial =
            dados.horaInicial ||
            dados.hora_inicial ||
            "";

          const horaFinal =
            dados.horaFinal ||
            dados.hora_final ||
            "";

          /*
           * =================================================
           * GRAVAÇÃO
           * =================================================
           */

          await env.DB
            .prepare(
              `
              INSERT INTO chamados
              (
                protocolo,
                data_abertura,
                hora_abertura,
                status,
                solicitante,
                cargo,
                bloco,
                pavimentos,
                ocorrencia,
                tipo_ocorrencia,
                detalhes,
                data_ocorrencia,
                hora_inicial,
                hora_final,
                responsavel,
                observacao_solucao,
                ultima_atualizacao,
                criado_em
              )

              VALUES
              (
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?
              )
              `
            )
            .bind(
              protocolo,
              data,
              hora,
              "Aberto",

              solicitante,
              cargo,
              bloco,
              pavimentos,

              ocorrencia,
              ocorrencia,
              detalhes,

              dataOcorrencia,
              horaInicial,
              horaFinal,

              "",
              "",

              hoje.toISOString(),
              hoje.toISOString()
            )
            .run();


          /*
           * =================================================
           * RESPOSTA
           * =================================================
           */

          return new Response(
            JSON.stringify({
              sucesso:
                true,

              protocolo:
                protocolo,

              mensagem:
                "Chamado registrado com sucesso."
            }),
            {
              status: 200,
              headers:
                corsHeaders
            }
          );

        }


        /*
         * Método não permitido
         */

        return new Response(
          JSON.stringify({
            erro:
              "Método não permitido."
          }),
          {
            status: 405,
            headers:
              corsHeaders
          }
        );

      }

      catch (erro) {

        console.error(
          "ERRO NA API:",
          erro
        );

        return new Response(
          JSON.stringify({
            sucesso:
              false,

            erro:
              "Erro interno no servidor.",

            detalhe:
              erro instanceof Error
                ? erro.message
                : String(erro)
          }),
          {
            status: 500,
            headers:
              corsHeaders
          }
        );

      }

    }


    /*
     * =====================================================
     * ARQUIVOS DO SITE
     * =====================================================
     */

    if (
      request.method === "GET"
    ) {

      return env.ASSETS.fetch(
        request
      );

    }


    /*
     * =====================================================
     * ROTA NÃO ENCONTRADA
     * =====================================================
     */

    return new Response(
      JSON.stringify({
        erro:
          "Rota não encontrada."
      }),
      {
        status: 404,
        headers:
          corsHeaders
      }
    );

  }
};
