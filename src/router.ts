import { NextRequest, NextResponse } from "next/server";

export type Context = {
  params: Promise<any> | any;
};

// Type definitions
export type Handler = (
  req: NextRequest,
  context?: Context
) => Promise<NextResponse> | NextResponse;

export type Middleware = (
  req: NextRequest,
  next: () => Promise<NextResponse>
) => Promise<NextResponse>;

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

interface RouteConfig {
  handler: Handler;
  middlewares: Middleware[];
}

export class Router {
  private routeMiddlewares: Middleware[] = [];
  private routes: Map<HttpMethod, RouteConfig> = new Map();

  /**
   * Add middleware that will be applied to all routes in this router
   */
  use(middleware: Middleware): Router {
    this.routeMiddlewares.push(middleware);
    return this;
  }

  /**
   * Register a GET route handler with optional middlewares
   */
  get(handler: Handler, ...middlewares: Middleware[]): Router {
    this.routes.set("GET", { handler, middlewares });
    return this;
  }

  /**
   * Register a POST route handler with optional middlewares
   */
  post(handler: Handler, ...middlewares: Middleware[]): Router {
    this.routes.set("POST", { handler, middlewares });
    return this;
  }

  /**
   * Register a PUT route handler with optional middlewares
   */
  put(handler: Handler, ...middlewares: Middleware[]): Router {
    this.routes.set("PUT", { handler, middlewares });
    return this;
  }

  /**
   * Register a DELETE route handler with optional middlewares
   */
  delete(handler: Handler, ...middlewares: Middleware[]): Router {
    this.routes.set("DELETE", { handler, middlewares });
    return this;
  }

  /**
   * Register a PATCH route handler with optional middlewares
   */
  patch(handler: Handler, ...middlewares: Middleware[]): Router {
    this.routes.set("PATCH", { handler, middlewares });
    return this;
  }

  /**
   * Register an OPTIONS route handler with optional middlewares
   */
  options(handler: Handler, ...middlewares: Middleware[]): Router {
    this.routes.set("OPTIONS", { handler, middlewares });
    return this;
  }

  /**
   * Register a HEAD route handler with optional middlewares
   */
  head(handler: Handler, ...middlewares: Middleware[]): Router {
    this.routes.set("HEAD", { handler, middlewares });
    return this;
  }

  /**
   * Execute middleware chain
   */
  private async executeMiddlewareChain(
    middlewares: Middleware[],
    req: NextRequest,
    finalHandler: Handler
  ): Promise<NextResponse> {
    let index = 0;

    const next = async (): Promise<NextResponse> => {
      if (index >= middlewares.length) {
        // All middlewares executed, call the final handler
        return finalHandler(req);
      }

      const middleware = middlewares[index++];
      return middleware(req, next);
    };

    return next();
  }

  /**
   * Generate the final handler for a specific HTTP method
   */
  private createMethodHandler(method: HttpMethod): Handler {
    const routeConfig = this.routes.get(method);

    if (!routeConfig) {
      return async () => {
        return NextResponse.json(
          { error: `Method ${method} not allowed` },
          { status: 405 }
        );
      };
    }

    const { handler, middlewares } = routeConfig;

    // Combine all middlewares: router-level + route-specific
    const allMiddlewares = [...this.routeMiddlewares, ...middlewares];

    return async (req: NextRequest) => {
      return this.executeMiddlewareChain(allMiddlewares, req, handler);
    };
  }

  /**
   * Export object with all HTTP method handlers for Next.js
   * Usage: export const { GET, POST, PUT, DELETE } = router.export();
   */
  export() {
    const exports: Partial<Record<HttpMethod, Handler>> = {};

    // Only export methods that have been registered
    this.routes.forEach((_, method) => {
      exports[method] = this.createMethodHandler(method);
    });

    return exports;
  }

  /**
   * Get a specific method handler
   * Usage: export const GET = router.getHandler('GET');
   */
  getHandler(method: HttpMethod): Handler {
    return this.createMethodHandler(method);
  }
}

// Utility function to create a new router instance
export function createRouter(): Router {
  return new Router();
}
