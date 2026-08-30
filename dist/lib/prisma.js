"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("../generated/prisma/client");
BigInt.prototype.toJSON =
    function toJSON() {
        return this.toString();
    };
exports.prisma = new client_1.PrismaClient();
