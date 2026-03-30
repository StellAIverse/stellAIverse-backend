import { Loan } from "../models/Loan";

export class LendingService {
  private loans: Loan[] = [];

  createLoan(loan: Loan) {
    this.loans.push(loan);
    return loan;
  }

  repayLoan(nftId: string) {
    const loan = this.loans.find((l) => l.nftId === nftId && l.active);
    if (!loan) throw new Error("Loan not found");

    loan.active = false;
    return loan;
  }
}
