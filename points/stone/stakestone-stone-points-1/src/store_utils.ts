import { EthContext } from "@sentio/sdk/eth";
import { EntityClass, ID, AbstractEntity } from "@sentio/sdk/store";
interface EntityWithNetwork extends AbstractEntity {
  network: string;
}

export async function storeListAll<T extends EntityWithNetwork>(
  ctx: EthContext,
  entity: EntityClass<T>
) {
  return (
    await ctx.store.list(entity, [
      {
        field: "network",
        op: "=",
        value: ctx.chainId.toString(),
      } as any,
    ])
  ).map((entity) => trimEntityID(entity));
}

export async function storeGet<T extends EntityWithNetwork>(
  ctx: EthContext,
  entity: EntityClass<T>,
  id: string
) {
  const realID = fixEntityID(ctx, id);
  const ret = await ctx.store.get(entity, realID);
  return ret ? trimEntityID(ret) : undefined;
}

export async function storeUpsert<T extends EntityWithNetwork>(
  ctx: EthContext,
  entity: T | T[]
) {
  if (Array.isArray(entity)) {
    entity.forEach((e) => {
      e.network = ctx.chainId.toString();
      e.id = fixEntityID(ctx, e.id);
    });
  } else {
    entity.network = ctx.chainId.toString();
    entity.id = fixEntityID(ctx, entity.id);
  }
  return ctx.store.upsert(entity);
}

function fixEntityID(ctx: EthContext, id: ID) {
  let idStr = id.toString();
  const p = idStr.indexOf("|");
  if (p > -1) {
    idStr = idStr.substring(p + 1);
  }
  return ctx.chainId.toString() + "|" + idStr;
}

function trimEntityID<T extends EntityWithNetwork>(entity: T) {
  let idStr = entity.id.toString();
  const p = idStr.indexOf("|");
  if (p > -1) {
    idStr = idStr.substring(p + 1);
  }
  entity.id = idStr;
  return entity;
}
