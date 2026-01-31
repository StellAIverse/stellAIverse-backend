import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { SimulatorService } from './simulator.service';
import { SimulationConfig } from './interfaces/simulation.interface';

@Controller('simulator')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Post('initialize')
  @HttpCode(HttpStatus.CREATED)
  async initializeSimulation(@Body() config: SimulationConfig) {
    const simulationId = await this.simulatorService.initializeSimulation(config);
    return { simulationId, message: 'Simulation initialized successfully' };
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  async runSimulation(@Param('id') id: string) {
    const result = await this.simulatorService.runSimulation(id);
    return result;
  }

  @Post(':id/reset')
  @HttpCode(HttpStatus.OK)
  async resetSimulation(@Param('id') id: string) {
    await this.simulatorService.resetSimulation(id);
    return { message: 'Simulation reset successfully' };
  }

  @Get(':id/state')
  async getSimulationState(@Param('id') id: string) {
    const state = await this.simulatorService.getSimulationState(id);
    return state;
  }

  @Post('verify-reproducibility')
  @HttpCode(HttpStatus.OK)
  async verifyReproducibility(@Body() body: { config: SimulationConfig; runs?: number }) {
    const isReproducible = await this.simulatorService.verifyReproducibility(
      body.config,
      body.runs || 2,
    );
    return {
      reproducible: isReproducible,
      message: isReproducible
        ? 'Simulation is reproducible'
        : 'Simulation is NOT reproducible',
    };
  }
}