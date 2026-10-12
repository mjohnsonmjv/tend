import { StyleSheet } from "react-native";

// Tend "First Light" brand palette.
export const colors = {
  white: "#FFFFFF",
  ivory: "#FBF8F1",
  gold: "#EFC65E",
  blush: "#E9D3C6",
  sage: "#93A68B",
  charcoal: "#2A2521",
  stone: "#E2DACA",
  muted: "#8A7F76",
  danger: "#B4432F",
};

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ivory,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.charcoal,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 24,
  },
  button: {
    backgroundColor: colors.charcoal,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 12,
  },
  buttonGold: {
    backgroundColor: colors.gold,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonTextDark: {
    color: colors.charcoal,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.stone,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.stone,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: colors.charcoal,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
});
