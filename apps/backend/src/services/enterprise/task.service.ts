import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { logger } from "./logger.service.js";
import { EnterpriseNotificationService } from "./notification.service.js";

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface TaskCommentData {
  id: string;
  taskId: string;
  userId?: string;
  authorName: string;
  comment: string;
  createdAt: string;
}

export interface InternalTaskData {
  id: string;
  companyId?: string;
  branchId?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  assignedToId?: string;
  assignedToName?: string;
  createdById?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  progressPercent: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  comments: TaskCommentData[];
}

export class EnterpriseTaskService {
  private static inMemoryTasks: Map<string, InternalTaskData> = new Map();

  /**
   * Creates a new internal task or activity
   */
  public static async createTask(data: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: string;
    assignedToId?: string;
    assignedToName?: string;
    createdById?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    companyId?: string;
    branchId?: string;
  }): Promise<InternalTaskData> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const task: InternalTaskData = {
      id,
      companyId: data.companyId,
      branchId: data.branchId,
      title: data.title,
      description: data.description,
      priority: data.priority ?? "NORMAL",
      status: "PENDING",
      dueDate: data.dueDate,
      assignedToId: data.assignedToId,
      assignedToName: data.assignedToName,
      createdById: data.createdById,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
      comments: [],
    };

    this.inMemoryTasks.set(id, task);

    // Persist to database if available
    try {
      await prisma.internalTask.create({
        data: {
          id: task.id,
          companyId: task.companyId ?? null,
          branchId: task.branchId ?? null,
          title: task.title,
          description: task.description ?? null,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          assignedToId: task.assignedToId ?? null,
          createdById: task.createdById ?? null,
          relatedEntityType: task.relatedEntityType ?? null,
          relatedEntityId: task.relatedEntityId ?? null,
          progressPercent: 0,
        },
      });
    } catch {
      // In offline/in-memory mode, stored in memory
    }

    if (task.assignedToId) {
      EnterpriseNotificationService.dispatch({
        type: task.priority === "URGENT" ? "CRITICAL" : "INFO",
        category: "SYSTEM",
        priority: task.priority,
        title: `Nova Tarefa Atribuída: ${task.title}`,
        message: task.description || `Foi-lhe atribuída uma nova tarefa com prioridade ${task.priority}.`,
        module: "TASKS",
        companyId: task.companyId,
        userId: task.assignedToId,
        actionUrl: `/tasks/${task.id}`,
      });
    }

    return task;
  }

  /**
   * Updates an existing task
   */
  public static async updateTask(
    id: string,
    updates: Partial<Pick<InternalTaskData, "title" | "description" | "priority" | "status" | "dueDate" | "assignedToId" | "progressPercent">>
  ): Promise<InternalTaskData> {
    const task = this.inMemoryTasks.get(id);
    if (!task) {
      throw new Error(`Tarefa não encontrada: ${id}`);
    }

    const now = new Date().toISOString();
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.priority !== undefined) task.priority = updates.priority;
    if (updates.dueDate !== undefined) task.dueDate = updates.dueDate;
    if (updates.assignedToId !== undefined) task.assignedToId = updates.assignedToId;
    if (updates.progressPercent !== undefined) {
      task.progressPercent = Math.min(100, Math.max(0, updates.progressPercent));
      if (task.progressPercent === 100 && task.status !== "COMPLETED") {
        task.status = "COMPLETED";
        task.completedAt = now;
      }
    }
    if (updates.status !== undefined) {
      task.status = updates.status;
      if (task.status === "COMPLETED") {
        task.progressPercent = 100;
        task.completedAt = now;
      }
    }
    task.updatedAt = now;

    try {
      await prisma.internalTask.update({
        where: { id },
        data: {
          title: task.title,
          description: task.description ?? null,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          assignedToId: task.assignedToId ?? null,
          progressPercent: task.progressPercent,
          completedAt: task.completedAt ? new Date(task.completedAt) : null,
        },
      });
    } catch {
      // In-memory fallback
    }

    return task;
  }

  /**
   * Adds an interactive comment / feedback to a task
   */
  public static async addComment(
    taskId: string,
    commentText: string,
    authorName = "Colaborador",
    userId?: string
  ): Promise<TaskCommentData> {
    const task = this.inMemoryTasks.get(taskId);
    if (!task) {
      throw new Error(`Tarefa não encontrada: ${taskId}`);
    }

    const commentId = crypto.randomUUID();
    const now = new Date().toISOString();

    const comment: TaskCommentData = {
      id: commentId,
      taskId,
      userId,
      authorName,
      comment: commentText,
      createdAt: now,
    };

    task.comments.push(comment);
    task.updatedAt = now;

    try {
      await prisma.taskComment.create({
        data: {
          id: comment.id,
          taskId: comment.taskId,
          userId: comment.userId ?? null,
          authorName: comment.authorName,
          comment: comment.comment,
        },
      });
    } catch {
      // In-memory fallback
    }

    return comment;
  }

  /**
   * Retrieves a task by ID
   */
  public static getTask(id: string): InternalTaskData | undefined {
    return this.inMemoryTasks.get(id);
  }

  /**
   * Lists tasks based on filters
   */
  public static listTasks(filters: {
    companyId?: string;
    assignedToId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    relatedEntityType?: string;
    relatedEntityId?: string;
  } = {}): InternalTaskData[] {
    let list = Array.from(this.inMemoryTasks.values());

    if (filters.companyId) {
      list = list.filter((t) => !t.companyId || t.companyId === filters.companyId);
    }
    if (filters.assignedToId) {
      list = list.filter((t) => t.assignedToId === filters.assignedToId);
    }
    if (filters.status) {
      list = list.filter((t) => t.status === filters.status);
    }
    if (filters.priority) {
      list = list.filter((t) => t.priority === filters.priority);
    }
    if (filters.relatedEntityType) {
      list = list.filter((t) => t.relatedEntityType === filters.relatedEntityType);
    }
    if (filters.relatedEntityId) {
      list = list.filter((t) => t.relatedEntityId === filters.relatedEntityId);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Generates summary metrics for operational task dashboards
   */
  public static getTaskMetrics(companyId?: string): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    urgent: number;
    overdue: number;
  } {
    const list = this.listTasks({ companyId });
    const now = new Date().getTime();

    let overdue = 0;
    for (const t of list) {
      if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.dueDate) {
        if (new Date(t.dueDate).getTime() < now) {
          overdue++;
        }
      }
    }

    return {
      total: list.length,
      pending: list.filter((t) => t.status === "PENDING").length,
      inProgress: list.filter((t) => t.status === "IN_PROGRESS").length,
      completed: list.filter((t) => t.status === "COMPLETED").length,
      urgent: list.filter((t) => t.priority === "URGENT" && t.status !== "COMPLETED").length,
      overdue,
    };
  }
}
