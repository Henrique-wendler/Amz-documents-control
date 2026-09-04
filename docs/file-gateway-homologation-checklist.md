# Checklist de homologação do File Gateway em Windows/SMB

Use exclusivamente uma pasta dedicada de homologação, por exemplo `SistemaRural-Homologacao`. O UNC `\\servidor\SistemaRural-Homologacao` é ilustrativo: host, paths, usuários e credenciais reais não pertencem a este documento, ao Git ou aos logs.

## Pré-condições

- [ ] Ambiente classificado como homologação, sem dados reais e sem acesso a outras áreas do servidor.
- [ ] Supabase do ambiente acessível por HTTPS de saída; nenhuma conexão inbound para o Gateway.
- [ ] Instância do Gateway ativa e vinculada à organização de homologação.
- [ ] Token bruto armazenado somente no secret store/ambiente da máquina; banco contém apenas o hash.
- [ ] Conta Windows dedicada, sem login interativo e sem privilégios administrativos.
- [ ] Permissões de share e NTFS limitadas à pasta dedicada: listar/ler, criar diretórios, temporários, hard links e arquivos finais.
- [ ] Conta sem permissão para apagar legados e sem acesso a outros compartilhamentos.
- [ ] `GATEWAY_ROOT_PATH` aponta para a pasta dedicada; `GATEWAY_TEMP_PATH` está no mesmo volume/share.
- [ ] Limites, polling, timeouts, lease, retries e backoff revisados para o ambiente.
- [ ] `npm run health` retorna saudável sem revelar path completo, URL assinada ou secret.

## Compatibilidade Windows/SMB

- [ ] Resolução canônica aceita o UNC autorizado e rejeita traversal (`..`).
- [ ] Junction/symlink apontando para fora da raiz é rejeitado.
- [ ] Publicação por hard link funciona entre temp e destino no mesmo volume.
- [ ] Configuração entre volumes retorna falha controlada; não ocorre fallback para cópia não atômica.
- [ ] Nomes Unicode e acentuados são lidos e preservados nos metadados esperados.
- [ ] Caminhos próximos ao limite operacional funcionam com a política de long paths do Windows e do servidor.
- [ ] Arquivos não incorporam CPF/CNPJ, e-mail ou outra PII na estrutura de diretórios gerada.

## Cenários funcionais

- [ ] Upload Cloud → local cria exatamente uma cópia e uma localização `network_share`.
- [ ] Disponibilização local → Cloud cria exatamente uma localização `supabase_storage` privada.
- [ ] SHA-256 do banco, origem e destino coincidem nos dois sentidos.
- [ ] Arquivo próximo ao limite configurado conclui; arquivo acima do limite falha de forma controlada.
- [ ] Arquivo com nome Unicode/acentos conclui.
- [ ] Objeto/arquivo já existente e igual é tratado idempotentemente.
- [ ] Conteúdo existente divergente gera conflito e não é sobrescrito.
- [ ] Arquivo legado local permanece intacto após local → Cloud.

## Falhas e recuperação

- [ ] Interrupção de rede durante download não publica arquivo parcial.
- [ ] Interrupção de rede durante upload permite retry sem duplicação.
- [ ] Reinício do processo após claim/lease retoma o job expirado.
- [ ] Reinício após publicação/upload e antes da confirmação conclui idempotentemente.
- [ ] Permissão NTFS/SMB negada gera código sanitizado e mantém origem/destino intactos.
- [ ] Arquivo em uso é tratado sem corromper ou substituir conteúdo.
- [ ] Espaço insuficiente falha sem publicação parcial; health sinaliza espaço quando disponível pelo SO.
- [ ] Temporários são removidos após sucesso e falha; marcadores do health não permanecem.
- [ ] Backoff e limite de tentativas evitam loop agressivo.

## Segurança e auditoria

- [ ] Usuário sem `files.manage` não solicita disponibilização remota.
- [ ] Gateway de outro tenant não reclama nem conclui o job.
- [ ] Secret inválido é rejeitado.
- [ ] Frontend recebe somente UUIDs e status, nunca path absoluto/UNC.
- [ ] Logs não contêm token, Authorization, signed URL, senha, usuário SMB ou path completo.
- [ ] `FILE_SYNC_STARTED`, `FILE_SYNCED` e `FILE_SYNC_FAILED` estão corretos.
- [ ] `REMOTE_COPY_REQUESTED`, `REMOTE_COPY_STARTED`, `REMOTE_COPY_COMPLETED` e `REMOTE_COPY_FAILED` estão corretos.
- [ ] Audit trail e locations permanecem consistentes após retry, conflito e restart.
- [ ] Antivírus corporativo examina o diretório sem quebrar atomicidade, timeout ou cleanup; exceções precisam de aprovação de Segurança.

## Operação e aceite

- [ ] `npm run build`, `npm test` e os testes integrados locais estão aprovados antes da instalação.
- [ ] Execução manual de um ciclo foi validada antes do polling contínuo.
- [ ] Serviço usa diretório de trabalho e variáveis corretos, reinicia após falha e encerra graciosamente.
- [ ] stdout/stderr JSON são capturados com retenção e acesso definidos, sem infraestrutura externa obrigatória.
- [ ] Alertas operacionais foram definidos para falhas persistentes, retries esgotados e espaço baixo.
- [ ] Backup, retenção, antivírus e resposta a incidentes têm responsáveis definidos.
- [ ] Fixtures, objetos Cloud e arquivos locais da homologação foram removidos ao final.
- [ ] Evidências de checksum, idempotência, auditoria e isolamento foram registradas sem dados sensíveis.
- [ ] Aceite conjunto de Infraestrutura, Segurança e responsável de negócio concluído antes de qualquer dado real.
