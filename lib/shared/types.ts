export type ProgramType = "capaska" | "corporate" | "all";

export type SessionUser = {
  id: number;
  name: string;
  username: string;
  role: "admin" | "operator" | "doctor" | "supervisor" | string;
  post_id: number | null;
  post_name: string | null;
  program_type: ProgramType;
};

export type StageProgress = {
  post_id: number;
  post_name: string;
  total_parameters: number;
  filled_parameters: number;
  is_done: boolean;
  status_text: "Done" | "Belum";
  progress_text: string;
  stage_order: number;
};
