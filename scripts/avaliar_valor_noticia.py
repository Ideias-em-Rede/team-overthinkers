import json
from pathlib import Path

from scripts.prompts.avaliar_valor_noticia import SYSTEM_PROMPT
from utils.deepinfra import chamar_modelo


# ============================================================
# CONFIGURAÇÃO
# ============================================================

DATASET_PATH = Path(
    "/home/joaopedro/Documents/team-overthinkers/dataset/"
    "PublicHearingBR_LDS.jsonl"
)

OUTPUT_PATH = Path(
    "/home/joaopedro/Documents/team-overthinkers/resultados/"
    "avaliacao_valores_noticia_amostra_1.json"
)

MODEL = "deepseek-ai/DeepSeek-V4-Flash"


# ============================================================
# LEITURA DA PRIMEIRA AMOSTRA
# ============================================================

with DATASET_PATH.open(
    "r",
    encoding="utf-8",
) as file:

    sample = json.loads(file.readline())


sample_id = sample["id"]
article = sample["materia"]


# ============================================================
# CHAMADA AO MODELO
# ============================================================

raw_result = chamar_modelo(
    prompt_sistema=SYSTEM_PROMPT,
    prompt_usuario=article,
    modelo=MODEL,
)


# ============================================================
# RESULTADO
# ============================================================

result = {
    "id_amostra": sample_id,
    **json.loads(raw_result),
}


# ============================================================
# SALVAR
# ============================================================

OUTPUT_PATH.parent.mkdir(
    parents=True,
    exist_ok=True,
)

with OUTPUT_PATH.open(
    "w",
    encoding="utf-8",
) as file:

    json.dump(
        result,
        file,
        ensure_ascii=False,
        indent=2,
    )


print(
    json.dumps(
        result,
        ensure_ascii=False,
        indent=2,
    )
)

print(f"\nResultado salvo em: {OUTPUT_PATH}")