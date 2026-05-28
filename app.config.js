const base = require('./app.json');

const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

module.exports = () => {
  const config = { ...base.expo };
  const adTestMode = process.env.EXPO_PUBLIC_ADMOB_TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';
  const androidAppId = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || (adTestMode ? TEST_ANDROID_APP_ID : undefined);
  const iosAppId = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || (adTestMode ? TEST_IOS_APP_ID : undefined);
  const plugins = [...(config.plugins || [])];
  const hasGoogleMobileAds = plugins.some((plugin) => (
    Array.isArray(plugin)
      ? plugin[0] === 'react-native-google-mobile-ads'
      : plugin === 'react-native-google-mobile-ads'
  ));

  if (!hasGoogleMobileAds) {
    plugins.push([
      'react-native-google-mobile-ads',
      {
        androidAppId,
        iosAppId,
      },
    ]);
  }

  return {
    ...config,
    plugins,
  };
};
