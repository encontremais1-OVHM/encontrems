# whatsapp-bridge/ — Integração WhatsApp (Fase 5)

Serviço independente, executado no Railway, que recebe ordens do Laravel e as executa através de um adaptador substituível:

```text
connect() · getConnectionStatus() · getGroups() · getParticipants()
generateInvite() · addParticipant() · removeParticipant() · verifyParticipant()
```

- `MockWhatsAppAdapter`: apenas para desenvolvimento; todas as operações marcadas como simuladas.
- `BiderAdapter`: só será implementado depois de analisar a documentação oficial e receber as credenciais. Nenhum endpoint ou formato de autenticação será inventado.
