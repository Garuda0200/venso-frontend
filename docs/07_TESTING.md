# 07 — Testing frontend

## Suites puras

- `assignmentProtection.test.ts`: invariantes de servicios/hoteles asignados.
- `postSaleEditState.test.ts`: estados, roles, TTL, nonce, versión y payload commit.
- `idempotency.test.ts`: formato/límites/unicidad de claves y headers.
- `passengerPricingPresentation.test.ts`: identidad de pasajeros y agregación adulta por beneficiario.

Scripts:

```bash
npm run test:assignment-protection
npm run test:post-sale-security
npm run test:idempotency
npm run test:passenger-pricing
npm test
```

## Gates de entrega

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Además de unitarios, realizar E2E del ciclo vendedor -> superadmin -> aprobación -> edición -> CONSUMED y doble submit de vouchers.
