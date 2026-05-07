import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhone(phone?: string) {
  if (!phone) return "Desconhecido";
  const cleaned = phone.replace(/\D/g, "");
  
  if (cleaned.length === 13 && cleaned.startsWith("55")) {
    const ddd = cleaned.substring(2, 4);
    const firstPart = cleaned.substring(4, 9);
    const secondPart = cleaned.substring(9);
    return `(${ddd}) ${firstPart}-${secondPart}`;
  }
  
  if (cleaned.length >= 10 && cleaned.length <= 11) {
     return `(${cleaned.substring(0,2)}) ${cleaned.substring(2, cleaned.length - 4)}-${cleaned.substring(cleaned.length - 4)}`;
  }
  
  return phone;
}

export function formatDate(dateString?: string) {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch (e) {
    return dateString;
  }
}
