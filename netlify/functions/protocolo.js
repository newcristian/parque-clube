import { getStore } from “@netlify/blobs”;

const store = getStore(“protocolos-parque-clube”);

function resposta(dados, status = 200) { return new
Response(JSON.stringify(dados), { status, headers: { “Content-Type”:
“application/json”, “Access-Control-Allow-Origin”: “*” } }); }

function obterDataBrasilia() { const agora = new Date(); const partes =
new Intl.DateTimeFormat(“en-CA”, { timeZone: “America/Sao_Paulo”, year:
“numeric”, month: “2-digit”, day: “2-digit” }).formatToParts(agora);

    return {
        ano: partes.find(p => p.type === "year").value,
        mes: partes.find(p => p.type === "month").value,
        dia: partes.find(p => p.type === "day").value
    };

}

function obterHoraBrasilia() { return new Intl.DateTimeFormat(“pt-BR”, {
timeZone: “America/Sao_Paulo”, hour: “2-digit”, minute: “2-digit”,
second: “2-digit”, hour12: false }).format(new Date()); }

export default async function handler(request) { if (request.method !==
“POST” && request.method !== “GET”) { return resposta({ erro: “Método
não permitido.” }, 405); }

    try {
        if (request.method === "GET") {
            const url = new URL(request.url);
            const protocolo = url.searchParams.get("protocolo");

            if (!protocolo) {
                return resposta({ erro: "Informe o número do protocolo." }, 400);
            }

            const protocoloNormalizado = protocolo.trim().toUpperCase();

            const chamado = await store.get(
                `chamado-${protocoloNormalizado}`,
                { type: "json", consistency: "strong" }
            );

            if (!chamado) {
                return resposta({
                    encontrado: false,
                    erro: "Protocolo não encontrado."
                }, 404);
            }

            return resposta({
                encontrado: true,
                chamado
            });
        }

        let dados = {};

        try {
            dados = await request.json();
        } catch {
            return resposta({ erro: "Dados inválidos." }, 400);
        }

        /* LISTAR TODOS OS PROTOCOLOS - ADMIN */
        if (dados.action === "list") {
            const senhaAdmin = process.env.ADMIN_PASSWORD;

            if (!senhaAdmin) {
                return resposta({
                    erro: "A senha administrativa não está configurada."
                }, 500);
            }

            if (!dados.adminPassword || dados.adminPassword !== senhaAdmin) {
                return resposta({
                    erro: "Senha administrativa incorreta."
                }, 401);
            }

            const chamadosValidos = [];
            let cursor;

            do {
                const pagina = await store.list({
                    prefix: "chamado-",
                    cursor
                });

                for (const blob of pagina.blobs || []) {
                    try {
                        const chamado = await store.get(blob.key, {
                            type: "json",
                            consistency: "strong"
                        });

                        if (chamado && chamado.protocolo) {
                            chamadosValidos.push(chamado);
                        }
                    } catch (erro) {
                        console.error("Erro ao ler:", blob.key, erro);
                    }
                }

                cursor = pagina.cursor;
            } while (cursor);

            chamadosValidos.sort((a, b) =>
                String(b.protocolo).localeCompare(
                    String(a.protocolo),
                    undefined,
                    { numeric: true }
                )
            );

            const chamadosArquivados = chamadosValidos.filter(c => c.arquivado === true);
            const chamadosAtivos = chamadosValidos.filter(c => c.arquivado !== true);

            const estatisticas = {
                total: chamadosAtivos.length,
                abertos: chamadosAtivos.filter(c => c.status === "Aberto").length,
                andamento: chamadosAtivos.filter(c => c.status === "Em andamento").length,
                resolvidos: chamadosAtivos.filter(c => c.status === "Resolvido").length,
                cancelados: chamadosAtivos.filter(c => c.status === "Cancelado").length,
                arquivados: chamadosArquivados.length
            };

            return resposta({
                sucesso: true,
                chamados: chamadosAtivos,
                chamadosArquivados,
                estatisticas
            });
        }

        /* ARQUIVAR / REABRIR / EXCLUIR CHAMADO - ADMIN */
        if (["archive", "reopen", "delete"].includes(dados.action)) {
            const senhaAdmin = process.env.ADMIN_PASSWORD;

            if (!senhaAdmin) {
                return resposta({
                    erro: "A senha administrativa não está configurada."
                }, 500);
            }

            if (!dados.adminPassword || dados.adminPassword !== senhaAdmin) {
                return resposta({
                    erro: "Senha administrativa incorreta."
                }, 401);
            }

            if (!dados.protocolo) {
                return resposta({ erro: "Informe o protocolo." }, 400);
            }

            const protocolo = String(dados.protocolo).trim().toUpperCase();
            const chave = `chamado-${protocolo}`;

            const chamadoAtual = await store.get(
                chave,
                { type: "json", consistency: "strong" }
            );

            if (!chamadoAtual) {
                return resposta({ erro: "Protocolo não encontrado." }, 404);
            }

            const dataAtual = obterDataBrasilia();
            const horaAtual = obterHoraBrasilia();
            const agoraTexto =
                `${dataAtual.dia}/${dataAtual.mes}/${dataAtual.ano} ${horaAtual}`;

            const historico = Array.isArray(chamadoAtual.historicoArquivamento)
                ? [...chamadoAtual.historicoArquivamento]
                : [];

            if (dados.action === "archive") {
                if (chamadoAtual.arquivado === true) {
                    return resposta({
                        sucesso: true,
                        mensagem: "O chamado já está arquivado.",
                        chamado: chamadoAtual
                    });
                }

                historico.push({
                    tipo: "ARQUIVADO",
                    dataHora: agoraTexto
                });

                const atualizado = {
                    ...chamadoAtual,
                    arquivado: true,
                    dataHoraArquivamento: agoraTexto,
                    historicoArquivamento: historico
                };

                await store.setJSON(chave, atualizado);

                return resposta({
                    sucesso: true,
                    mensagem: "Chamado arquivado com sucesso.",
                    chamado: atualizado
                });
            }

            if (dados.action === "reopen") {
                if (chamadoAtual.arquivado !== true) {
                    return resposta({
                        sucesso: true,
                        mensagem: "O chamado já está ativo.",
                        chamado: chamadoAtual
                    });
                }

                historico.push({
                    tipo: "REABERTO",
                    dataHora: agoraTexto
                });

                const atualizado = {
                    ...chamadoAtual,
                    arquivado: false,
                    dataHoraReabertura: agoraTexto,
                    historicoArquivamento: historico
                };

                await store.setJSON(chave, atualizado);

                return resposta({
                    sucesso: true,
                    mensagem: "Chamado reaberto com sucesso.",
                    chamado: atualizado
                });
            }

            await store.delete(chave);

            return resposta({
                sucesso: true,
                mensagem: "Chamado excluído definitivamente.",
                protocolo
            });
        }

        /* ATUALIZAR CHAMADO - ADMIN */
        if (dados.action === "update") {
            const senhaAdmin = process.env.ADMIN_PASSWORD;

            if (!senhaAdmin) {
                return resposta({
                    erro: "A senha administrativa não está configurada."
                }, 500);
            }

            if (!dados.adminPassword || dados.adminPassword !== senhaAdmin) {
                return resposta({
                    erro: "Senha administrativa incorreta."
                }, 401);
            }

            if (!dados.protocolo) {
                return resposta({ erro: "Informe o protocolo." }, 400);
            }

            const protocolo = String(dados.protocolo).trim().toUpperCase();

            const chamadoAtual = await store.get(
                `chamado-${protocolo}`,
                { type: "json", consistency: "strong" }
            );

            if (!chamadoAtual) {
                return resposta({ erro: "Protocolo não encontrado." }, 404);
            }

            const statusPermitidos = [
                "Aberto",
                "Em andamento",
                "Resolvido",
                "Cancelado"
            ];

            if (!statusPermitidos.includes(dados.status)) {
                return resposta({ erro: "Status inválido." }, 400);
            }

            const dataAtual = obterDataBrasilia();
            const horaAtual = obterHoraBrasilia();

            const chamadoAtualizado = {
                ...chamadoAtual,
                status: dados.status,
                responsavel: dados.responsavel || "",
                observacaoSolucao: dados.observacaoSolucao || "",
                ultimaAtualizacao:
                    `${dataAtual.dia}/${dataAtual.mes}/${dataAtual.ano} ${horaAtual}`
            };

            if (dados.status === "Resolvido") {
                chamadoAtualizado.dataConclusao =
                    `${dataAtual.dia}/${dataAtual.mes}/${dataAtual.ano}`;
                chamadoAtualizado.horaConclusao = horaAtual;
            } else {
                delete chamadoAtualizado.dataConclusao;
                delete chamadoAtualizado.horaConclusao;
            }

            await store.setJSON(
                `chamado-${protocolo}`,
                chamadoAtualizado
            );

            return resposta({
                sucesso: true,
                mensagem: "Chamado atualizado com sucesso.",
                chamado: chamadoAtualizado
            });
        }

        /* CRIAR NOVO CHAMADO */
        const data = obterDataBrasilia();
        const chaveContador =
            `contador-${data.ano}-${data.mes}-${data.dia}`;

        for (let tentativa = 0; tentativa < 20; tentativa++) {
            const atual = await store.getWithMetadata(
                chaveContador,
                { consistency: "strong" }
            );

            if (!atual || atual.data === null) {
                const resultado = await store.set(
                    chaveContador,
                    "1",
                    { onlyIfNew: true }
                );

                if (resultado.modified) {
                    const protocolo =
                        `PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-001`;

                    const chamado = {
                        protocolo,
                        dataAbertura:
                            `${data.dia}/${data.mes}/${data.ano}`,
                        horaAbertura: obterHoraBrasilia(),
                        status: "Aberto",
                        arquivado: false,
                        historicoArquivamento: [],
                        solicitante: dados.solicitante || "",
                        cargo: dados.cargo || "",
                        bloco: dados.bloco || "",
                        pavimentos: dados.pavimentos || "",
                        ocorrencia: dados.ocorrencia || "",
                        dataOcorrencia: dados.dataOcorrencia || "",
                        horaInicial: dados.horaInicial || "",
                        horaFinal: dados.horaFinal || "",
                        detalhes: dados.detalhes || "",
                        responsavel: "",
                        observacaoSolucao: ""
                    };

                    await store.setJSON(
                        `chamado-${protocolo}`,
                        chamado
                    );

                    return resposta({
                        sucesso: true,
                        protocolo,
                        chamado
                    });
                }

                continue;
            }

            let numeroAtual = parseInt(atual.data, 10);
            if (isNaN(numeroAtual)) numeroAtual = 0;

            const novoNumero = numeroAtual + 1;

            const resultado = await store.set(
                chaveContador,
                String(novoNumero),
                { onlyIfMatch: atual.etag }
            );

            if (resultado.modified) {
                const sequencial =
                    String(novoNumero).padStart(3, "0");

                const protocolo =
                    `PC-${data.dia}-${data.mes}-${String(data.ano).slice(-2)}-${sequencial}`;

                const chamado = {
                    protocolo,
                    dataAbertura:
                        `${data.dia}/${data.mes}/${data.ano}`,
                    horaAbertura: obterHoraBrasilia(),
                    status: "Aberto",
                    solicitante: dados.solicitante || "",
                    cargo: dados.cargo || "",
                    bloco: dados.bloco || "",
                    pavimentos: dados.pavimentos || "",
                    ocorrencia: dados.ocorrencia || "",
                    dataOcorrencia: dados.dataOcorrencia || "",
                    horaInicial: dados.horaInicial || "",
                    horaFinal: dados.horaFinal || "",
                    detalhes: dados.detalhes || "",
                    responsavel: "",
                    observacaoSolucao: ""
                };

                await store.setJSON(
                    `chamado-${protocolo}`,
                    chamado
                );

                return resposta({
                    sucesso: true,
                    protocolo,
                    chamado
                });
            }
        }

        return resposta({
            sucesso: false,
            erro: "Não foi possível gerar o protocolo. Tente novamente."
        }, 503);

    } catch (erro) {
        console.error("ERRO NA FUNCTION PROTOCOLO:", erro);

        return resposta({
            sucesso: false,
            erro: "Erro interno no sistema.",
            detalhe: erro.message
        }, 500);
    }

}
