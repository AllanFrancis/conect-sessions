# Digest — SPEC-20260906-1146-bootstrap-sem-bom
<!-- ≤2000 bytes LF; a ferramenta mede -->
**Resumo:** Servir o bootstrap sem BOM, porque ele é executado como string por [scriptblock]::Create() e o U+FEFF impede o parser de reconhecer o `<#` inicial. · **Features:** dashboard · **Commit final:** `8697429`
**Entregue:** corrigido e provado — bootstrap servido sem BOM, E2E usando `irm` + scriptblock (critérios 1/1, concluída 2026-09-06 11:55)
