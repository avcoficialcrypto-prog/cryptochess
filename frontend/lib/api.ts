// ============================================================
// CryptoChess - API Client (Wallet-Based)
// No JWT — uses x-wallet-address header
// ============================================================

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = BACKEND_URL;
  }

  private getWallet(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('cryptochess_wallet');
  }

  async request<T>(endpoint: string, options: { method?: string; body?: any } = {}): Promise<T> {
    const { method = 'GET', body } = options;
    const wallet = this.getWallet();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (wallet) {
      headers['x-wallet-address'] = wallet;
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data as T;
  }

  // ---- Auth ----
  async connectWallet(walletAddress: string) {
    return this.request<{ player: any; isNew: boolean }>('/api/auth/connect', {
      method: 'POST',
      body: { walletAddress },
    });
  }

  async getProfile() {
    return this.request<any>('/api/auth/me');
  }

  // ---- Wallet ----
  async getBalance() {
    return this.request<{ wallet_address: string; balance_usdc: number }>('/api/wallet/balance');
  }

  async getTransactions(page = 1, limit = 20) {
    return this.request<any>(`/api/wallet/transactions?page=${page}&limit=${limit}`);
  }

  async deposit(amount: number) {
    return this.request<any>('/api/wallet/deposit', {
      method: 'POST',
      body: { amount },
    });
  }

  async getStats() {
    return this.request<any>('/api/wallet/stats');
  }

  // ---- Games ----
  async createChallenge(stakeAmount: number, customStake?: number) {
    return this.request<any>('/api/games/challenge', {
      method: 'POST',
      body: { stakeAmount, customStake },
    });
  }

  async getChallenge(code: string) {
    return this.request<any>(`/api/games/challenge/${code}`);
  }

  async getGameHistory(page = 1) {
    return this.request<any>(`/api/games/history?page=${page}`);
  }

  // ---- Matchmaking ----
  async getMatchmakingStatus() {
    return this.request<any>('/api/matchmaking/status');
  }
}

export const api = new ApiClient();
export default api;
