export interface Loan {
    nftId: string;
    borrower: string;
    lender: string;
    amount: number;
    interestRate: number;
    duration: number;
    active: boolean;
  }