"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateProfileDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_profile_dto_1 = require("./create-profile.dto");
class UpdateProfileDto extends (0, mapped_types_1.PartialType)(create_profile_dto_1.CreateProfileDto) {
}
exports.UpdateProfileDto = UpdateProfileDto;
