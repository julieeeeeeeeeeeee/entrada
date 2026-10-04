// Assina o APK com a chave fixa (vinda dos Secrets do GitHub). Sem a chave, cai na assinatura de teste.
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    if (!process.env.KEYSTORE_PATH) return c;
    let g = c.modResults.contents;
    if (g.includes('ENTRADA_RELEASE')) return c;
    g = g.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ENTRADA_RELEASE {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storeType "pkcs12"
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }`,
    );
    // no buildType release, troca a assinatura de debug pela nossa
    g = g.replace(/(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.ENTRADA_RELEASE');
    c.modResults.contents = g;
    return c;
  });
