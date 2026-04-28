/**
 * Cliente da API do AdvBox (CRM jurídico)
 * Documentação: https://docs.advbox.com.br
 * Autenticação: Bearer token via env ADVBOX_API_KEY
 *
 * Endpoints utilizados:
 *   POST /v1/pessoas          → cria cliente
 *   GET  /v1/pessoas?search=  → busca cliente por CPF / nome
 *   POST /v1/casos            → cria processo (caso)
 *   PATCH /v1/casos/:id       → atualiza caso
 */

const BASE = "https://api.advbox.com.br/api/v1";

function headers() {
  const key = process.env.ADVBOX_API_KEY;
  if (!key) throw new Error("ADVBOX_API_KEY não configurada");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AdvBox ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AdvboxPessoa {
  id: number;
  nome: string;
  telefone?: string;
  email?: string;
  cpf?: string;
}

export interface AdvboxCaso {
  id: number;
  titulo: string;
  numero_processo?: string;
  status?: string;
  pessoa_id?: number;
}

// ─── Pessoas (clientes) ───────────────────────────────────────────────────────

export async function buscarPessoa(query: string): Promise<AdvboxPessoa[]> {
  const r = await request<{ data?: AdvboxPessoa[] }>(
    "GET",
    `/pessoas?search=${encodeURIComponent(query)}`
  );
  return r.data ?? [];
}

export async function criarPessoa(dados: {
  nome: string;
  telefone?: string;
}): Promise<AdvboxPessoa> {
  const r = await request<{ data?: AdvboxPessoa; pessoa?: AdvboxPessoa }>(
    "POST",
    "/pessoas",
    { nome: dados.nome, telefone: dados.telefone }
  );
  return (r.data ?? r.pessoa) as AdvboxPessoa;
}

export async function buscarOuCriarPessoa(dados: {
  nome: string;
  telefone?: string;
}): Promise<AdvboxPessoa> {
  if (dados.telefone) {
    const found = await buscarPessoa(dados.telefone).catch(() => []);
    if (found.length > 0) return found[0];
  }
  if (dados.nome) {
    const found = await buscarPessoa(dados.nome).catch(() => []);
    if (found.length > 0) return found[0];
  }
  return criarPessoa(dados);
}

// ─── Casos (processos) ────────────────────────────────────────────────────────

export async function criarCaso(dados: {
  titulo: string;
  pessoa_id: number;
  numero_processo?: string;
  descricao?: string;
}): Promise<AdvboxCaso> {
  const r = await request<{ data?: AdvboxCaso; caso?: AdvboxCaso }>(
    "POST",
    "/casos",
    dados
  );
  return (r.data ?? r.caso) as AdvboxCaso;
}

export async function atualizarCaso(
  id: string | number,
  dados: Partial<{ titulo: string; numero_processo: string; descricao: string }>
): Promise<AdvboxCaso> {
  const r = await request<{ data?: AdvboxCaso; caso?: AdvboxCaso }>(
    "PATCH",
    `/casos/${id}`,
    dados
  );
  return (r.data ?? r.caso) as AdvboxCaso;
}

export async function buscarCaso(id: string | number): Promise<AdvboxCaso> {
  const r = await request<{ data?: AdvboxCaso; caso?: AdvboxCaso }>(
    "GET",
    `/casos/${id}`
  );
  return (r.data ?? r.caso) as AdvboxCaso;
}
