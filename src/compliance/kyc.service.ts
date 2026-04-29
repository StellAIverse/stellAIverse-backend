import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { KycProfile, KycDocument, KycStatusHistory, KycStatus, DocumentType } from "../compliance/entities/kyc.entity";
import { User } from "../../user/entities/user.entity";
import { KycSubmitDto, KycDocumentUploadDto, KycReviewDto, KycStatusResponseDto } from "../dto/kyc.dto";
import { NotificationService } from "../../notification/notification.service";

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly uploadPath = path.join(process.cwd(), "uploads", "kyc");
  private readonly encryptionKey = crypto.scryptSync(
    process.env.KYC_ENCRYPTION_KEY || "default-kyc-key",
    "salt",
    32,
  );

  constructor(
    @InjectRepository(KycProfile)
    private readonly kycProfileRepository: Repository<KycProfile>,
    @InjectRepository(KycDocument)
    private readonly kycDocumentRepository: Repository<KycDocument>,
    @InjectRepository(KycStatusHistory)
    private readonly kycStatusHistoryRepository: Repository<KycStatusHistory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async submitKyc(userId: string, submitDto: KycSubmitDto): Promise<KycProfile> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Check if KYC profile already exists
    let kycProfile = await this.kycProfileRepository.findOne({
      where: { userId },
    });

    if (kycProfile && kycProfile.status !== KycStatus.UNVERIFIED) {
      throw new BadRequestException("KYC already submitted or in progress");
    }

    const profileData = {
      userId,
      fullName: submitDto.fullName,
      dateOfBirth: new Date(submitDto.dateOfBirth),
      country: submitDto.country,
      address: submitDto.address,
      city: submitDto.city,
      postalCode: submitDto.postalCode,
      phoneNumber: submitDto.phoneNumber,
      occupation: submitDto.occupation,
      sourceOfFunds: submitDto.sourceOfFunds,
      annualIncome: submitDto.annualIncome,
      taxId: submitDto.taxId,
      nationality: submitDto.nationality,
      status: KycStatus.PENDING,
      submittedAt: new Date(),
    };

    if (kycProfile) {
      // Update existing profile
      await this.kycProfileRepository.update(kycProfile.id, profileData);
      kycProfile = await this.kycProfileRepository.findOne({
        where: { id: kycProfile.id },
      });
    } else {
      // Create new profile
      kycProfile = this.kycProfileRepository.create(profileData);
      await this.kycProfileRepository.save(kycProfile);
    }

    // Update user KYC status
    await this.userRepository.update(userId, { kycStatus: KycStatus.PENDING });

    // Record status change
    await this.recordStatusChange(kycProfile.id, KycStatus.UNVERIFIED, KycStatus.PENDING, userId);

    // Send notification
    await this.notificationService.sendEmail(
      user.email,
      "KYC Submission Received",
      `Dear ${submitDto.fullName},\n\nYour KYC application has been submitted successfully and is now under review. You will receive an email notification once the review is complete.\n\nBest regards,\nStellAIverse Team`,
    );

    return kycProfile;
  }

  async uploadDocument(
    userId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
  ): Promise<KycDocument> {
    const kycProfile = await this.kycProfileRepository.findOne({
      where: { userId },
    });

    if (!kycProfile) {
      throw new BadRequestException("KYC profile not found. Please submit KYC first.");
    }

    if (kycProfile.status !== KycStatus.PENDING && kycProfile.status !== KycStatus.IN_REVIEW) {
      throw new BadRequestException("Cannot upload documents for current KYC status");
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException("File size exceeds 10MB limit");
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException("Invalid file type. Only JPEG, PNG, and PDF files are allowed.");
    }

    // Generate encryption keys
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher("aes-256-cbc", this.encryptionKey);

    // Encrypt file
    const encryptedData = Buffer.concat([
      cipher.update(file.buffer),
      cipher.final(),
    ]);

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const encryptedFileName = `${crypto.randomUUID()}${fileExtension}`;
    const encryptedFilePath = path.join(this.uploadPath, encryptedFileName);

    // Save encrypted file
    fs.writeFileSync(encryptedFilePath, encryptedData);

    // Create document record
    const document = this.kycDocumentRepository.create({
      kycProfileId: kycProfile.id,
      documentType,
      fileName: encryptedFileName,
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      encryptedFilePath,
      encryptionKey: this.encryptionKey.toString("hex"),
      encryptionIv: iv.toString("hex"),
      verified: false,
    });

    await this.kycDocumentRepository.save(document);

    return document;
  }

  async getKycStatus(userId: string): Promise<KycStatusResponseDto> {
    const kycProfile = await this.kycProfileRepository.findOne({
      where: { userId },
      relations: ["documents"],
    });

    if (!kycProfile) {
      return {
        userId,
        status: KycStatus.UNVERIFIED,
      };
    }

    const documents = kycProfile.documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      fileName: doc.originalFileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      verified: doc.verified,
      verifiedAt: doc.verifiedAt?.toISOString(),
      verificationNotes: doc.verificationNotes,
    }));

    return {
      userId,
      status: kycProfile.status,
      fullName: kycProfile.fullName,
      dateOfBirth: kycProfile.dateOfBirth?.toISOString(),
      country: kycProfile.country,
      submittedAt: kycProfile.submittedAt?.toISOString(),
      reviewedAt: kycProfile.reviewedAt?.toISOString(),
      notes: kycProfile.notes,
      documents,
    };
  }

  async reviewKyc(
    kycProfileId: string,
    reviewerId: string,
    reviewDto: KycReviewDto,
  ): Promise<KycProfile> {
    const kycProfile = await this.kycProfileRepository.findOne({
      where: { id: kycProfileId },
      relations: ["user"],
    });

    if (!kycProfile) {
      throw new NotFoundException("KYC profile not found");
    }

    if (kycProfile.status !== KycStatus.IN_REVIEW) {
      throw new BadRequestException("KYC profile is not in review status");
    }

    const previousStatus = kycProfile.status;
    const newStatus = reviewDto.status === "verified" ? KycStatus.VERIFIED : KycStatus.REJECTED;

    // Update KYC profile
    await this.kycProfileRepository.update(kycProfileId, {
      status: newStatus,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      notes: reviewDto.notes,
    });

    // Update user KYC status
    await this.userRepository.update(kycProfile.userId, { kycStatus: newStatus });

    // Record status change
    await this.recordStatusChange(kycProfileId, previousStatus, newStatus, reviewerId, reviewDto.notes);

    // Send notification to user
    const subject = newStatus === KycStatus.VERIFIED ? "KYC Approved" : "KYC Rejected";
    const message = newStatus === KycStatus.VERIFIED
      ? `Congratulations! Your KYC application has been approved. You now have full access to all platform features.`
      : `Unfortunately, your KYC application has been rejected. Reason: ${reviewDto.notes || "Please contact support for more details."}`;

    await this.notificationService.sendEmail(
      kycProfile.user.email,
      subject,
      `Dear ${kycProfile.fullName},\n\n${message}\n\nBest regards,\nStellAIverse Compliance Team`,
    );

    return await this.kycProfileRepository.findOne({
      where: { id: kycProfileId },
      relations: ["documents"],
    });
  }

  async getPendingKycSubmissions(): Promise<KycProfile[]> {
    return this.kycProfileRepository.find({
      where: { status: KycStatus.PENDING },
      relations: ["user", "documents"],
      order: { submittedAt: "ASC" },
    });
  }

  async moveToReview(kycProfileId: string, reviewerId: string): Promise<KycProfile> {
    const kycProfile = await this.kycProfileRepository.findOne({
      where: { id: kycProfileId },
    });

    if (!kycProfile) {
      throw new NotFoundException("KYC profile not found");
    }

    if (kycProfile.status !== KycStatus.PENDING) {
      throw new BadRequestException("KYC profile must be in pending status to move to review");
    }

    const previousStatus = kycProfile.status;

    await this.kycProfileRepository.update(kycProfileId, {
      status: KycStatus.IN_REVIEW,
    });

    // Update user KYC status
    await this.userRepository.update(kycProfile.userId, { kycStatus: KycStatus.IN_REVIEW });

    // Record status change
    await this.recordStatusChange(kycProfileId, previousStatus, KycStatus.IN_REVIEW, reviewerId);

    return await this.kycProfileRepository.findOne({
      where: { id: kycProfileId },
      relations: ["documents"],
    });
  }

  async downloadDocument(userId: string, documentId: string): Promise<Buffer> {
    const document = await this.kycDocumentRepository.findOne({
      where: { id: documentId },
      relations: ["kycProfile"],
    });

    if (!document || document.kycProfile.userId !== userId) {
      throw new NotFoundException("Document not found");
    }

    // Decrypt file
    const encryptedData = fs.readFileSync(document.encryptedFilePath);
    const decipher = crypto.createDecipher("aes-256-cbc", this.encryptionKey);

    const decryptedData = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    return decryptedData;
  }

  async deleteUserData(userId: string): Promise<void> {
    // Find KYC profile
    const kycProfile = await this.kycProfileRepository.findOne({
      where: { userId },
      relations: ["documents"],
    });

    if (kycProfile) {
      // Delete encrypted files
      for (const document of kycProfile.documents) {
        try {
          if (fs.existsSync(document.encryptedFilePath)) {
            fs.unlinkSync(document.encryptedFilePath);
          }
        } catch (error) {
          this.logger.error(`Failed to delete file ${document.encryptedFilePath}`, error);
        }
      }

      // Delete database records
      await this.kycStatusHistoryRepository.delete({ kycProfileId: kycProfile.id });
      await this.kycDocumentRepository.delete({ kycProfileId: kycProfile.id });
      await this.kycProfileRepository.delete({ id: kycProfile.id });
    }

    // Update user
    await this.userRepository.update(userId, {
      kycStatus: KycStatus.UNVERIFIED,
      isActive: false,
    });
  }

  private async recordStatusChange(
    kycProfileId: string,
    previousStatus: KycStatus,
    newStatus: KycStatus,
    changedBy: string,
    reason?: string,
  ): Promise<void> {
    const history = this.kycStatusHistoryRepository.create({
      kycProfileId,
      previousStatus,
      newStatus,
      changedBy,
      reason,
    });

    await this.kycStatusHistoryRepository.save(history);
  }
}</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/src/compliance/kyc.service.ts