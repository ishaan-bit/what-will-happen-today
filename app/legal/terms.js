import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { palette, spacing, type } from '@/utils/theme';
import { tap } from '@/utils/haptics';

const COMPANY = 'QuietDen (OPC) Private Limited';

export default function TermsScreen() {
  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { tap(); router.back(); }} style={styles.backBtn}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>WWHT TERMS OF SERVICE</Text>
        <Text style={styles.title}>Terms of Service</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <P>
          What Will Happen Today is a daily prediction experience published by {COMPANY}.
          It is intended for reflection and entertainment. It is not medical, psychological,
          legal, or financial advice.
        </P>

        <H>Usage</H>
        <Bullet>You must be at least 16 to use the app, or have a guardian's consent.</Bullet>
        <Bullet>You agree not to misuse the service, automate abuse, or attempt unauthorized access.</Bullet>
        <Bullet>The "predictions" are reflective prompts. Outcomes are not guaranteed.</Bullet>

        <H>Purchases</H>
        <Bullet>Daily Reveal (₹29) unlocks the remaining signals for the current calendar day only.</Bullet>
        <Bullet>30-Day Pass (₹49) unlocks every reading for 30 days, billed once via Google Play.</Bullet>
        <Bullet>Purchases are processed by Google Play. Refunds follow Google Play policy.</Bullet>
        <Bullet>The first 3 days are free for every new install.</Bullet>

        <H>Liability</H>
        <Bullet>Predictions are informational and may not reflect clinical or financial advice.</Bullet>
        <Bullet>The service is provided on an "as available" basis without warranties.</Bullet>
        <Bullet>{COMPANY} is not liable for actions taken in reliance on predictions.</Bullet>

        <H>Termination</H>
        <P>
          You may stop using the app and remove all local data by uninstalling. We may suspend
          access if the service is misused.
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
