import { Module } from "@nestjs/common";
import { PricePredictionService } from "./price-prediction.service";
import { PricePredictionController } from "./price-prediction.controller";

@Module({
  controllers: [PricePredictionController],
  providers: [PricePredictionService],
  exports: [PricePredictionService],
})
export class PricePredictionModule {}
