// Acrescenta ao app.json: o esquema do "endereço de volta" do login, a versão (vinda da tag do GitHub) e a assinatura.
module.exports = ({ config }) => ({
  ...config,
  version: process.env.APP_VERSION || config.version,
  scheme: ['entrada', 'br.julie.entrada'],
  android: { ...config.android, versionCode: Number(process.env.VERSION_CODE || 1) },
  plugins: [...(config.plugins || []), './plugins/withSigning'],
});
