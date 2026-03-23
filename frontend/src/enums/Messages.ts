export const Messages = {
  SUCCESS: "Success",
  CLAIM_CREATED: "Claim created successfully.",
  DOCUMENTS_UPLOADED: "Documents uploaded successfully. Processing started.",
  CLAIM_NOT_FOUND: "Claim not found.",
  INVALID_DOC_TYPE: "Invalid document type.",
  OCR_COMPLETED: "OCR processing completed.",
  VALIDATION_COMPLETED: "Validation completed.",
  REVIEW_SUBMITTED: "Review submitted successfully.",
  CORRECTIONS_APPLIED: "Corrections applied successfully.",
  INTERNAL_SERVER_ERROR: "An internal server error occurred."
} as const;

export type MessagesType = typeof Messages[keyof typeof Messages];
