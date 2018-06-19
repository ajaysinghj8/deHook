import 'reflect-metadata';

type IHandler = (...args: Array<any>) => Promise<any>;

interface IHook {
    on(hookName: String, handler: IHandler | Array<IHandler>): IHook;
    off(hookName: String, handler?: (...args: Array<any>) => Promise<any>): Boolean;
    trigger(ctx: any, hookName: String, ...args: any[]): Promise<any>;
}

class KlassHook {
    private list: Map<String, Array<IHandler>> = new Map();
    on(hookName: String, handler: IHandler | Array<IHandler>) {
        if (!this.list.has(hookName)) this.list.set(hookName, []);
        const hooks = this.list.get(hookName);
        if (typeof handler === 'function') {
            hooks.push(handler);
            return this;
        }
        if (Array.isArray(handler)) {
            for (var i = 0; i < handler.length; i++) {
                hooks.push(handler[i]);
            }
            return this;
        }
        throw new Error('invalid hookFunction in hooks.on');
    }

    off(hookName: String, handler?: (...args: Array<any>) => Promise<any>) {
        if (!this.list.has(hookName)) return false;
        if (!handler) {
            this.list.delete(hookName);
            return true;
        }
        const hooks = this.list.get(hookName);
        for (var i = 0; i < hooks.length; i++) {
            if (hooks[i] === handler) {
                hooks.splice(i, 1);
                this.list.set(hookName, hooks);
                return true;
            }
        }
        return false;
    }

    async trigger(ctx: any, hookName: String, ...args: any[]): Promise<any> {
        if (!this.list.has(hookName)) return Promise.resolve();
        const hooks = this.list.get(hookName);
        let output = args;
        for (let hook of hooks) {
            output = await hook.call(ctx, ...argsHandler(output));
        }
        return output;
    }

}




export function Hookable<T extends { new(...args: any[]): {} }>(Ctor: T) {
    class Construct extends Ctor {
        constructor(...args: any[]) {
            super(...args);
            Reflect.defineMetadata('hooks', new KlassHook(), this);
        }
    }
    Reflect.defineProperty(Construct, 'name', { value: Ctor.name, writable: false });
    Reflect.defineProperty(Construct, 'prototype', { value: Ctor.prototype, writable: false });
    return Construct;
}




interface TriggerHookConfig {
    isAsync?: Boolean;
    background?: Boolean;
    pre?: Boolean;
    post?: Boolean;
    name?: String;
}
export function deHook(config: TriggerHookConfig = {}) {
    const execBoth = ((config.pre && config.post) || (!config.pre && !config.post));
    const execPre = execBoth || config.pre;
    const execPost = execBoth || config.post;

    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalFn: Function = descriptor.value;
        const preHookName = `pre-${config.name || originalFn.name}`;
        const postHookName = `post-${config.name || originalFn.name}`;
        let proxyFn = null;
        if (config.isAsync && !config.background) {
            proxyFn = async function (...args: any[]) {
                let resultPre = args, resultOriginal, resultPost;
                if (execPre) resultPre = await getHookMetaData(this).trigger(this, preHookName, ...args);
                resultPost = resultOriginal = await originalFn.call(this, ...argsHandler(resultPre));
                if (execPost) resultPost = await getHookMetaData(this).trigger(this, postHookName, ...argsHandler(resultOriginal));
                return resultPost;
            };
        }
        else {
            proxyFn = function (...args: any[]) {
                if (execPre) getHookMetaData(this).trigger(this, preHookName, ...args);
                const result = originalFn.call(this, ...args);
                if (execPost) getHookMetaData(this).trigger(this, postHookName, ...args);
                return result;
            };
        }
        Reflect.defineProperty(proxyFn, 'name', { value: originalFn.name });

        descriptor.value = proxyFn;
    };
}


function argsHandler(args: any[]) {
    if (!args) {
        return [];
    }
    if (Array.isArray(args)) {
        return args;
    }
    return [args];
}

function getHookMetaData(obj: any): KlassHook {
    return Reflect.getOwnMetadata('hooks', obj);
}
export class Hook {
    static off(obj: any, hookName: String, handler?: IHandler) {
        const hook = getHookMetaData(obj);
        hook.off(hookName, handler);
        return Hook;
    }
    static on(obj: any, hookName: String, handler: IHandler) {
        const hook = getHookMetaData(obj);
        hook.on(hookName, handler);
        return Hook;
    }
    static customTrigger(obj: any, hookName: String, ...args: any[]): Promise<any> {
        const hook = getHookMetaData(obj);
        return hook.trigger(obj, hookName, ...args);
    }
    static after(obj: any, hookName: String, handler: IHandler) {
        return Hook.on(obj, 'post-' + hookName, handler);
    }

    static before(obj: any, hookName: String, handler: IHandler) {
        return Hook.on(obj, 'pre-' + hookName, handler);
    }

}