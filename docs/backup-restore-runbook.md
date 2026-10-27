# Backup e restauração para release

## Estado observado em staging (16/10/2026)

O projeto `sistema-rural-staging-clean` está no plano Free. O painel **Database → Backups** informa que esse plano não inclui backups agendados; não foi apresentado um backup gerenciado nem PITR utilizável para o ensaio. Uma exportação lógica e uma cópia independente dos objetos continuam sendo alternativas que exigem preparação, destino e responsáveis aprovados. Os dados de staging são exclusivamente sintéticos. Nenhum ensaio de restauração foi executado.

O [backup gerenciado do Supabase](https://supabase.com/docs/guides/platform/backups) cobre o banco e metadados de Storage, **não** os bytes dos objetos. O [restore para um novo projeto](https://supabase.com/docs/guides/platform/clone-project) também exige reconfiguração de Auth, Edge Functions, secrets e Storage.

## Decisões obrigatórias antes de produção

| Item | Proposta para aprovação | Estado |
|---|---|---|
| Responsável pelo backup e restore | Nomear operador principal e substituto, com acesso administrativo controlado | Pendente |
| Banco: frequência e retenção | Plano com backup diário e retenção mínima de 7 dias; avaliar PITR se RPO de 24 h não bastar | Pendente de plano/aceite |
| Banco: RPO | Até 24 h como alvo inicial; menor RPO exige PITR ou estratégia adicional | Proposto, não comprovado |
| Serviço completo: RTO | Até 8 h como alvo inicial, incluindo Storage, Auth, Functions e validações | Proposto, não comprovado |
| Storage: frequência e retenção | Cópia diária dos bytes de `rural-documents` para destino privado independente, com retenção inicial de 30 dias | Pendente de destino/aceite |
| Ensaio | Restaurar banco e objetos em ambiente isolado descartável antes do go-live e periodicamente depois | `BLOCKED_OPERATIONAL`: backup utilizável e ambiente de ensaio ainda não aprovados |

Os valores de RPO/RTO acima são **metas propostas**, não garantias. Aprovar custos, retenção, localização dos dados e responsáveis antes de criar produção. O plano Free atual não substitui essas decisões; a [documentação oficial](https://supabase.com/docs/guides/platform/backups) informa backups diários para Pro/Team/Enterprise e PITR como complemento pago, com requisitos próprios de compute.

## Procedimento de backup

1. Registrar identificador do projeto, horário UTC, versão das migrations, contagem de registros críticos, tamanho do banco e lista de objetos de `rural-documents`.
2. Confirmar que o backup gerenciado do banco terminou; guardar a evidência de horário e retenção. Se o plano escolhido não oferecer backup gerenciado, criar exportação lógica com `supabase db dump` para destino externo criptografado e testar sua restauração. A exportação lógica não dispensa cópia dos objetos.
3. Copiar os **bytes** do bucket privado por API de Storage ou interface S3 compatível usando credencial de servidor de menor privilégio. Nunca colocar essa credencial no frontend, Git ou logs. Manter chave do objeto, tamanho, MIME, checksum SHA-256 e timestamp em manifesto protegido.
4. Armazenar cópias cifradas em conta/projeto independente, com acesso restrito ao operador designado, retenção aprovada e alerta para falha ou atraso. Não copiar dados de staging para destinos reais nesta fase.
5. Registrar separadamente a configuração necessária à recuperação: migrations, Auth URL/SMTP/MFA, variáveis de Edge Functions, deploys, bucket privado e policies. Secrets ficam no cofre operacional, não no backup de código.

O [guia de download de objetos](https://supabase.com/docs/guides/storage/management/download-objects) documenta CLI e S3 compatível. A metadata do banco sem os bytes não permite recuperar um arquivo.

## Ensaio de restauração isolado

1. Provisionar um projeto descartável, sem domínio de produção, e bloquear envio de e-mail e integrações externas durante o ensaio.
2. Restaurar o backup de banco no projeto descartável. Aplicar/reconciliar migrations e configurações do projeto conforme o método de restore aprovado.
3. Restaurar os bytes do manifesto para um bucket privado equivalente **pela API de Storage**; não escrever diretamente em `storage.objects`.
4. Executar `supabase/validation/staging-readiness.sql` ou sua versão de produção, conferir contagens e integridade referencial, e comparar manifesto: nomes, quantidades, tamanhos e SHA-256.
5. Com identidade sintética, baixar amostras autorizadas e confirmar bloqueio AAL1 e de outro tenant. Verificar Auth, Functions e frontend no ambiente descartável.
6. Medir perda máxima de dados e tempo total até serviço validado. Só considerar RPO/RTO aprovados se o ensaio atingir as metas. Descartar o ambiente e suas credenciais após registrar evidências sanitizadas.

Não restaurar sobre o staging existente. O plano Free, isoladamente, não impede um ensaio com exportação lógica e objetos copiados. Enquanto não houver backup utilizável, ambiente isolado e execução comprovada, a restauração permanece `BLOCKED_OPERATIONAL` para liberação de produção.

## Monitoramento mínimo recomendado para V1

Definir responsável e canal de alerta para indisponibilidade HTTPS do frontend, erros JavaScript, Edge Functions 5xx, falhas Auth/SMTP, erros de Storage, atraso/falha de backup e falha de verificação do manifesto. Revisar alertas diariamente e registrar incidente, impacto e recuperação. Sentry ou equivalente é **recomendado**, sem instalação automática nesta fase. Não incluir tokens, URLs assinadas, conteúdo de documentos ou dados pessoais em telemetria.
