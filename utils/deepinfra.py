import os
import time

from openai import OpenAI


BASE_URL = "https://api.deepinfra.com/v1/openai"


def chamar_modelo(
    prompt_sistema: str,
    prompt_usuario: str,
    modelo: str,
    api_key: str | None = None,
    tentativas: int = 5,
    intervalo: int = 5,
    temperatura: float = 0.0,
    max_tokens: int = 4000,
) -> str:
    """
    Envia uma solicitação para um modelo da DeepInfra
    e retorna apenas o conteúdo textual da resposta.
    """

    api_key = api_key or os.getenv("DEEPINFRA_API_TOKEN")

    if not api_key:
        raise RuntimeError(
            "A variável de ambiente DEEPINFRA_API_TOKEN "
            "não foi definida."
        )

    client = OpenAI(
        api_key=api_key,
        base_url=BASE_URL,
    )

    for tentativa in range(1, tentativas + 1):

        try:
            print(
                f"Enviando requisição ao modelo "
                f"{modelo} "
                f"(tentativa {tentativa}/{tentativas})..."
            )

            response = client.chat.completions.create(
                model=modelo,
                messages=[
                    {
                        "role": "system",
                        "content": prompt_sistema,
                    },
                    {
                        "role": "user",
                        "content": prompt_usuario,
                    },
                ],
                temperature=temperatura,
                max_tokens=max_tokens,
                response_format={
                    "type": "json_object"
                },
            )

            return response.choices[0].message.content

        except Exception as exc:

            print(
                f"Erro na tentativa {tentativa}: {exc}"
            )

            if tentativa == tentativas:
                raise

            print(
                f"Aguardando {intervalo} segundos "
                "antes de tentar novamente..."
            )

            time.sleep(intervalo)

    raise RuntimeError(
        "A chamada ao modelo não foi concluída."
    )