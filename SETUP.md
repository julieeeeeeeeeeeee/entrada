# Entrada — como o app é gerado e atualizado

O app é gerado pelo **GitHub** (de graça) e se atualiza sozinho a partir da aba **Releases** do repositório. Não usa Expo nem loja.

## Como funciona

1. Você publica uma versão (cria uma *tag* como `v1.0.1`).
2. O GitHub Actions (`.github/workflows/build.yml`) compila o APK, assina com a chave fixa e coloca na aba Releases.
3. O app, ao abrir, olha a última Release. Se for mais nova, aparece **"Nova versão — Atualizar"**; toque, baixe e confirme a instalação do Android.

## Publicar uma versão nova

```bash
git tag v1.0.1
git push origin v1.0.1
```

Em uns 10–15 minutos o APK aparece em **Releases**. O número da tag vira a versão do app (sempre maior que a anterior).
Também dá para rodar manualmente: aba **Actions → Gerar APK → Run workflow** e digitar a versão.

## Instalar pela primeira vez

Abra a página de Releases no celular, baixe o `Entrada-x.y.z.apk` e instale (o Android pede para permitir "instalar apps desconhecidos" do navegador).

## Chave de assinatura (importante)

A chave fica em `email-app/_chaves/` no seu computador (e nos *Secrets* do GitHub). **Faça uma cópia dessa pasta.**
Se a chave se perder, o Android não deixa atualizar o app por cima — seria preciso desinstalar e instalar de novo.
Nunca publique essa pasta.

## Login com Google

O app usa um *Client ID* do Google Cloud (guardado como variável `GOOGLE_CLIENT_ID` do repositório e, para testes locais, no arquivo `.env`).
Sem ele, o app abre só em modo demonstração. O pacote do app é `br.julie.entrada`.

> Na primeira vez que você entrar com o Google, aparece o aviso **"app não verificado"**. É normal em app pessoal.
> Toque em **Avançado → Acessar Entrada**.

## Testar sem instalar nada

```bash
npm run web      # abre no navegador, em modo demonstração
```

## Como o app se comporta

- **Desfazer em tudo.** Arquivar, lixeira, bloquear e marcar como não lida só são feitos de verdade depois de 5 segundos.
  Enviar espera 10 segundos. *Se você fechar o app nesse intervalo, a ação não acontece.*
- **Bloquear** cria um filtro no Gmail que manda tudo daquele remetente para a lixeira. Dá para desbloquear na seção Bloqueados.
- **Arquivados** = tudo que não está na Entrada, nos Enviados, na Lixeira nem no Spam.
- **Categorias e ícones** são decididos pelo remetente e pelo assunto (`src/classify.ts`).
- **Salvar anexos** pergunta uma pasta na primeira vez e lembra nas próximas.
