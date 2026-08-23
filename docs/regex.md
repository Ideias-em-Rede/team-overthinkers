# Os 3 regex do pipeline

---

## 1. `SPEECH_RE` — em `reorganizar_transcricao.py`
```
(?ms)^(?P<gender>O SR\.|A SRA\.)\s+(?P<speaker>[^\r\n(]+?)(?:\s*\((?P<meta>[^)\r\n]*)\))?\s*[-–—]\s*(?P<fala>.*?)(?=^(?:O SR\.|A SRA\.)\s+|\Z)
```
Lê a transcrição **bruta** e reorganiza em blocos de fala por participantes, que ficam salvos em **dataset/transcricao_reorganizada**.

---

## 2. `PARTICIPANTE_RE` — em `capturar_metadados.py`
```
(?ms)^##\s+(?P<genero>SR\.|SRA\.)\s+(?P<nome>[^\r\n(]+?)(?:\((?P<partido_uf>[^)\r\n]*)\))?\s*$\n+(?P<corpo>.*?)(?=^##\s+|\Z)
```
Lê a transcrição já reorganizada e extrai, de cada participante, o gênero, o nome, o partido/estado e o corpo com as falas.

---

## 3. `FALA_RE` — em `capturar_metadados.py`
```
(?m)^-\s+(?P<fala>.+)$
```
Dentro do corpo de um bloco (já separado pelo regex 2), pega cada bullet `- fala` individualmente para contar falas/palavras.