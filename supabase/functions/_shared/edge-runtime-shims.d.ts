declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(...args: any[]): any;
}

declare module 'npm:@aws-sdk/client-route-53' {
  export class Route53Client {
    constructor(config?: any);
    send(command: any): Promise<any>;
  }

  export class ListHostedZonesCommand {
    constructor(input?: any);
  }
}