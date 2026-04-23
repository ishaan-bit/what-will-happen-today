import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { palette, spacing, type, radius } from '@/utils/theme';
import { tap } from '@/utils/haptics';

const COMPANY = 'QuietDen (OPC) Private Limited';
const SUPPORT_EMAIL = 'qdenxp@gmail.com';

export default function PrivacyScreen() {
  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { tap(); router.back(); }} style={styles.backBtn}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>WWHT PRIVACY POLICY</Text>
        <Text style={styles.title}>Privacy Policy</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <P>
          What Will Happen Today is a daily prediction experience published by {COMPANY}.
          We collect the minimum data required to deliver daily readings, verify in-app
          purchases, and keep the service stable.
        </P>

        <H>What we collect</H>
        <Bullet>An anonymous device identifier stored locally on your device.</Bullet>
        <Bullet>Local prediction history so we don't repeat the same reading too soon.</Bullet>
        <Bullet>In-app purchase tokens and Google Play transaction metadata for verification.</Bullet>
        <Bullet>Anonymous diagnostic and product analytics events (e.g. PostHog), no personal content.</Bullet>

        <H>How we use data</H>
        <Bullet>Generate, rotate, and personalize today's reading.</Bullet>
        <Bullet>Verify that an unlock has been purchased and grant access to all four signals.</Bullet>
        <Bullet>Diagnose crashes, monitor service health, and improve reliability.</Bullet>

        <H>Data handling</H>
        <Bullet>Most state is held only on your device via local storage.</Bullet>
        <Bullet>Server-side data sits in Upstash Redis under app-specific keys.</Bullet>
        <Bullet>All transport runs over HTTPS in production.</Bullet>

        <H>Your choices</H>
        <Bullet>The app works fully without an account.</Bullet>
        <Bullet>You can uninstall at any time to remove all local data.</Bullet>
        <Bullet>You can request deletion of any server-side data by emailing {SUPPORT_EMAIL}.</Bullet>

        <H>Sharing</H>
        <P>
          We use trusted processors to operate the service: Vercel, Upstash Redis, Google Play
          Billing, PostHog, and Sentry. We do not sell personal data.
        </P>

        <H>Contact</H>
        <P>
          For privacy requests, contact {SUPPORT_EMAIL}.
        </P>

        <Text style={styles.footer}>Last updated: April 22, 2026.</Text>
      </ScrollView>
    </ScreenShell>
  );
}

function P({ children }) { return <Text style={styles.p}>{children}</Text>; }
function H({ children }) { return <Text style={styles.h}>{children}</Text>; }
function Bullet({ children }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.dot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  backBtn: { alignSelf: 'flex-start', paddingVertical: spacing.xs, paddingRight: spacing.md },
  back: { ...type.body, color: palette.textSub },
  kicker: { ...type.kicker, color: palette.accent, marginTop: spacing.sm, letterSpacing: 2 },
  title: { ...type.hero, color: palette.text, marginTop: spacing.xs, fontSize: 28 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  p: { ...type.body, color: palette.textSub, marginBottom: spacing.md, lineHeight: 23 },
  h: { ...type.heading, color: palette.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  bulletRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm, paddingRight: spacing.sm },
  dot: { ...type.body, color: palette.accent, lineHeight: 23 },
  bulletText: { ...type.body, color: palette.textSub, flex: 1, lineHeight: 23 },
  footer: { ...type.caption, color: palette.textMuted, marginTop: spacing.xl, fontStyle: 'italic' },
});
