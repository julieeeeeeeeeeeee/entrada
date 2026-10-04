// Acrescenta ao app.json: o "endereço de volta" do login do Google, a versão (vinda da tag do GitHub) e a assinatura.
const id = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const reverse = id.replace('.apps.googleusercontent.com', '');

module.exports = ({ config }) => ({
  ...config,
  version: process.env.APP_VERSION || config.version,
  scheme: id.endsWith('.apps.googleusercontent.com')
    ? ['entrada', `com.googleusercontent.apps.${reverse}`]
    : 'entrada',
  android: { ...config.android, versionCode: Number(process.env.VERSION_CODE || 1) },
  plugins: [...(config.plugins || []), './plugins/withSigning'],
});
