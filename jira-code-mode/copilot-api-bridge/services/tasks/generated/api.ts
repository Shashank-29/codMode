/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface User {
  id?: string;
  name?: string;
  email?: string;
  role?: "developer" | "manager" | "qa";
}

export interface Task {
  id?: string;
  title?: string;
  description?: string;
  status?: "todo" | "in_progress" | "done";
  priority?: "low" | "medium" | "high" | "critical";
  assignee?: string | null;
  tags?: string[];
  /** @format date-time */
  createdAt?: string;
  /** @format date-time */
  updatedAt?: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
  assignee?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: "todo" | "in_progress" | "done";
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
}

export interface TaskStats {
  total?: number;
  byStatus?: {
    todo?: number;
    in_progress?: number;
    done?: number;
  };
  byPriority?: {
    low?: number;
    medium?: number;
    high?: number;
    critical?: number;
  };
  unassigned?: number;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "http://localhost:4000";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.JsonApi]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title Task Manager API
 * @version 1.0.0
 * @baseUrl http://localhost:4000
 *
 * Simple task management microservice with CRUD operations, user management, and task statistics.
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  api = {
    /**
     * @description Returns service health status and uptime.
     *
     * @name GetHealth
     * @summary Health check
     * @request GET:/api/health
     */
    getHealth: (params: RequestParams = {}) =>
      this.request<
        {
          /** @example "ok" */
          status?: string;
          /** @example "task-manager" */
          service?: string;
          /** @example 123.45 */
          uptime?: number;
        },
        any
      >({
        path: `/api/health`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * @description Returns all users in the system.
     *
     * @name ListUsers
     * @summary List all users
     * @request GET:/api/users
     */
    listUsers: (params: RequestParams = {}) =>
      this.request<User[], any>({
        path: `/api/users`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * @description Returns all tasks, with optional filters by status, priority, assignee, or tag.
     *
     * @name ListTasks
     * @summary List tasks
     * @request GET:/api/tasks
     */
    listTasks: (
      query?: {
        /** Filter by task status */
        status?: "todo" | "in_progress" | "done";
        /** Filter by priority level */
        priority?: "low" | "medium" | "high" | "critical";
        /** Filter by assignee user ID */
        assignee?: string;
        /** Filter by tag */
        tag?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<Task[], any>({
        path: `/api/tasks`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),

    /**
     * @description Creates a task with the given details. Status defaults to 'todo'.
     *
     * @name CreateTask
     * @summary Create a new task
     * @request POST:/api/tasks
     */
    createTask: (data: CreateTaskRequest, params: RequestParams = {}) =>
      this.request<Task, void>({
        path: `/api/tasks`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Returns aggregate statistics: total count, breakdown by status and priority, unassigned count.
     *
     * @name GetTaskStats
     * @summary Get task statistics
     * @request GET:/api/tasks/stats
     */
    getTaskStats: (params: RequestParams = {}) =>
      this.request<TaskStats, any>({
        path: `/api/tasks/stats`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * @description Returns full details of a single task.
     *
     * @name GetTask
     * @summary Get a task by ID
     * @request GET:/api/tasks/{id}
     */
    getTask: (id: string, params: RequestParams = {}) =>
      this.request<Task, void>({
        path: `/api/tasks/${id}`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * @description Updates the specified fields of a task.
     *
     * @name UpdateTask
     * @summary Update a task
     * @request PUT:/api/tasks/{id}
     */
    updateTask: (
      id: string,
      data: UpdateTaskRequest,
      params: RequestParams = {},
    ) =>
      this.request<Task, void>({
        path: `/api/tasks/${id}`,
        method: "PUT",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Permanently removes a task.
     *
     * @name DeleteTask
     * @summary Delete a task
     * @request DELETE:/api/tasks/{id}
     */
    deleteTask: (id: string, params: RequestParams = {}) =>
      this.request<
        {
          deleted?: string;
        },
        void
      >({
        path: `/api/tasks/${id}`,
        method: "DELETE",
        format: "json",
        ...params,
      }),

    /**
     * @description Sets the assignee of a task to the specified user.
     *
     * @name AssignTask
     * @summary Assign a task to a user
     * @request POST:/api/tasks/{id}/assign
     */
    assignTask: (
      id: string,
      data: {
        /** User ID to assign the task to */
        userId: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<Task, void>({
        path: `/api/tasks/${id}/assign`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
}
