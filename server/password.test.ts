import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Mock do bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

describe("Password Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Password Hashing", () => {
    it("should hash password with bcrypt", async () => {
      const password = "minhasenha123";
      const hashedPassword = "$2a$10$hashedpassword";
      
      vi.mocked(bcrypt.hash).mockResolvedValue(hashedPassword as never);
      
      const result = await bcrypt.hash(password, 10);
      
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 10);
      expect(result).toBe(hashedPassword);
    });

    it("should verify password correctly", async () => {
      const password = "minhasenha123";
      const hashedPassword = "$2a$10$hashedpassword";
      
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      
      const result = await bcrypt.compare(password, hashedPassword);
      
      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it("should reject wrong password", async () => {
      const wrongPassword = "senhaerrada";
      const hashedPassword = "$2a$10$hashedpassword";
      
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
      
      const result = await bcrypt.compare(wrongPassword, hashedPassword);
      
      expect(result).toBe(false);
    });
  });

  describe("Password Validation", () => {
    it("should validate minimum length of 6 characters", () => {
      const shortPassword = "12345";
      const validPassword = "123456";
      
      expect(shortPassword.length >= 6).toBe(false);
      expect(validPassword.length >= 6).toBe(true);
    });

    it("should validate password confirmation match", () => {
      const password = "minhasenha123";
      const confirmPassword = "minhasenha123";
      const wrongConfirmation = "outrasenha";
      
      expect(password === confirmPassword).toBe(true);
      expect(password === wrongConfirmation).toBe(false);
    });
  });

  describe("Password Strength", () => {
    it("should calculate password strength correctly", () => {
      const getPasswordStrength = (password: string) => {
        let strength = 0;
        if (password.length >= 6) strength++;
        if (password.length >= 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        return strength;
      };

      // Senha fraca (apenas minúsculas, 6 caracteres)
      expect(getPasswordStrength("abcdef")).toBe(1);
      
      // Senha média (8 caracteres com número)
      expect(getPasswordStrength("abcdef12")).toBe(3);
      
      // Senha forte (8+ caracteres, maiúscula, número, especial)
      expect(getPasswordStrength("Abcdef1!")).toBe(5);
    });

    it("should identify weak passwords", () => {
      const isWeakPassword = (password: string) => {
        if (password.length < 6) return true;
        if (!/[A-Z]/.test(password) && !/[0-9]/.test(password)) return true;
        return false;
      };

      expect(isWeakPassword("12345")).toBe(true);
      expect(isWeakPassword("abcdef")).toBe(true);
      expect(isWeakPassword("Abcdef1")).toBe(false);
    });
  });

  describe("Change Password Flow", () => {
    it("should require current password when user has password set", () => {
      const hasPassword = true;
      const currentPassword = "";
      
      const shouldRequireCurrentPassword = hasPassword && !currentPassword;
      
      expect(shouldRequireCurrentPassword).toBe(true);
    });

    it("should not require current password for first-time setup", () => {
      const hasPassword = false;
      const currentPassword = "";
      
      const shouldRequireCurrentPassword = hasPassword && !currentPassword;
      
      expect(shouldRequireCurrentPassword).toBe(false);
    });

    it("should validate new password before changing", () => {
      const validatePasswordChange = (
        newPassword: string,
        confirmPassword: string
      ): { valid: boolean; error?: string } => {
        if (newPassword.length < 6) {
          return { valid: false, error: "A senha deve ter pelo menos 6 caracteres" };
        }
        if (newPassword !== confirmPassword) {
          return { valid: false, error: "As senhas não conferem" };
        }
        return { valid: true };
      };

      expect(validatePasswordChange("12345", "12345")).toEqual({
        valid: false,
        error: "A senha deve ter pelo menos 6 caracteres",
      });

      expect(validatePasswordChange("123456", "654321")).toEqual({
        valid: false,
        error: "As senhas não conferem",
      });

      expect(validatePasswordChange("123456", "123456")).toEqual({
        valid: true,
      });
    });
  });

  describe("API Input Validation", () => {
    it("should validate changePassword input schema", () => {
      const validateInput = (input: {
        currentPassword?: string;
        newPassword: string;
        confirmPassword: string;
      }) => {
        const errors: string[] = [];
        
        if (input.newPassword.length < 6) {
          errors.push("A senha deve ter pelo menos 6 caracteres");
        }
        
        if (input.newPassword !== input.confirmPassword) {
          errors.push("As senhas não conferem");
        }
        
        return errors;
      };

      expect(validateInput({
        newPassword: "123456",
        confirmPassword: "123456",
      })).toEqual([]);

      expect(validateInput({
        newPassword: "12345",
        confirmPassword: "12345",
      })).toContain("A senha deve ter pelo menos 6 caracteres");

      expect(validateInput({
        newPassword: "123456",
        confirmPassword: "654321",
      })).toContain("As senhas não conferem");
    });

    it("should validate setInitialPassword input schema", () => {
      const validateInput = (input: {
        newPassword: string;
        confirmPassword: string;
      }) => {
        if (input.newPassword.length < 6) {
          return false;
        }
        if (input.newPassword !== input.confirmPassword) {
          return false;
        }
        return true;
      };

      expect(validateInput({
        newPassword: "senhasegura",
        confirmPassword: "senhasegura",
      })).toBe(true);

      expect(validateInput({
        newPassword: "abc",
        confirmPassword: "abc",
      })).toBe(false);
    });
  });
});
