import { Component } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { palette, spacing, type } from '@/utils/theme';
import { captureError } from '@/services/crashService';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    captureError(error, { errorInfo, screen: 'root' });
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>The app encountered an unexpected error.</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry} activeOpacity={0.7}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: { ...type.title, color: palette.text, marginBottom: spacing.sm, textAlign: 'center' },
  body: { ...type.body, color: palette.textSub, textAlign: 'center', marginBottom: spacing.xl },
  button: {
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: 99,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  buttonText: { ...type.bodyMed, color: palette.accent },
});
