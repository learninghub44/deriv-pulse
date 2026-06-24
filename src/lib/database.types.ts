export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      watchlists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          symbols: string[];
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          symbols?: string[];
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          symbols?: string[];
          is_default?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      trade_journal: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          contract_type: string;
          stake: number;
          payout: number | null;
          outcome: "win" | "loss" | "pending";
          entry_digit: number | null;
          barrier: number | null;
          duration_ticks: number | null;
          notes: string | null;
          opened_at: string;
          closed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          contract_type: string;
          stake: number;
          payout?: number | null;
          outcome?: "win" | "loss" | "pending";
          entry_digit?: number | null;
          barrier?: number | null;
          duration_ticks?: number | null;
          notes?: string | null;
          opened_at?: string;
          closed_at?: string | null;
          created_at?: string;
        };
        Update: {
          symbol?: string;
          contract_type?: string;
          stake?: number;
          payout?: number | null;
          outcome?: "win" | "loss" | "pending";
          entry_digit?: number | null;
          barrier?: number | null;
          duration_ticks?: number | null;
          notes?: string | null;
          closed_at?: string | null;
        };
        Relationships: [];
      };
      signal_history: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          signal_type: string;
          signal_value: string;
          confidence: number;
          window_size: number;
          tick_epoch: number;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          symbol: string;
          signal_type: string;
          signal_value: string;
          confidence: number;
          window_size: number;
          tick_epoch: number;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          metadata?: Json | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      trade_outcome: "win" | "loss" | "pending";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
