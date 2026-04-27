import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { PricePredictionService } from "./price-prediction.service";
import { PredictionRequestDto, BacktestRequestDto } from "./dto/prediction.dto";

@Controller("price-prediction")
@UseGuards(JwtAuthGuard)
export class PricePredictionController {
  constructor(private readonly predictionService: PricePredictionService) {}

  @Post("predict")
  predict(@Body() dto: PredictionRequestDto) {
    return this.predictionService.predict(dto);
  }

  @Get("symbols")
  getSupportedSymbols() {
    return { symbols: this.predictionService.getSupportedSymbols() };
  }

  @Get("model/metrics")
  getModelMetrics() {
    return this.predictionService.getModelMetrics();
  }

  @Post("backtest")
  backtest(@Body() dto: BacktestRequestDto) {
    return this.predictionService.backtest(dto);
  }
}
