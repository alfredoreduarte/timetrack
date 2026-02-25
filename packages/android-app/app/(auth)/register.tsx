import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Link } from "expo-router";
import Toast from "react-native-toast-message";
import { useAppDispatch, useAppSelector } from "../../src/hooks/useTypedDispatch";
import { registerUser, clearError } from "../../src/store/slices/authSlice";
import { authAPI } from "../../src/services/api";
import { CaptchaSvg } from "../../src/components/CaptchaSvg";
import { colors } from "../../src/theme/colors";
import { spacing, borderRadius, fontSize } from "../../src/theme/spacing";

export default function RegisterScreen() {
  const dispatch = useAppDispatch();
  const { isLoading, error } = useAppSelector((state) => state.auth);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaValue, setCaptchaValue] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [loadingCaptcha, setLoadingCaptcha] = useState(true);

  const loadCaptcha = async () => {
    setLoadingCaptcha(true);
    try {
      const data = await authAPI.getCaptcha();
      setCaptchaId(data.captchaId);
      setCaptchaSvg(data.captchaSvg);
    } catch {
      Toast.show({ type: "error", text1: "Failed to load captcha" });
    }
    setLoadingCaptcha(false);
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !captchaValue.trim()) {
      Toast.show({ type: "error", text1: "Please fill in all fields" });
      return;
    }
    dispatch(clearError());
    try {
      await dispatch(
        registerUser({
          name: name.trim(),
          email: email.trim(),
          password,
          captchaId,
          captchaValue: captchaValue.trim(),
        })
      ).unwrap();
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Registration failed", text2: err });
      loadCaptcha();
      setCaptchaValue("");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>TimeTrack</Text>
          <Text style={styles.subtitle}>Create your account</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Create a password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
          />

          {/* Captcha */}
          <Text style={styles.label}>Verification</Text>
          <View style={styles.captchaContainer}>
            {loadingCaptcha ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <CaptchaSvg svgString={captchaSvg} />
            )}
            <Pressable onPress={loadCaptcha} style={styles.refreshBtn}>
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={captchaValue}
            onChangeText={setCaptchaValue}
            placeholder="Enter the text above"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? "Creating account..." : "Create Account"}
            </Text>
          </Pressable>

          <View style={styles.links}>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text style={styles.link}>Already have an account? Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: "700",
    color: colors.primary,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.background,
  },
  captchaContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
  },
  refreshBtn: {
    padding: spacing.sm,
  },
  refreshText: {
    color: colors.primary,
    fontSize: fontSize.sm,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  links: {
    alignItems: "center",
    marginTop: spacing.lg,
  },
  link: {
    color: colors.primary,
    fontSize: fontSize.sm,
  },
});
