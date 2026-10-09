/** 复用 NeoBlog 的 types/user.ts；承担同名模块职责并保留原有导出。 */
export type Role = "admin" | "member";
export type Status = "normal" | "banned" | "frozen";

export interface User {
    id: number,
    natayark_id: number,
    username: string,
    email: string,
    avatar: string,
    role: Role,
    created_at: string,
    updated_at: string,
    status: Status
}